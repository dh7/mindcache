import type { MindCache } from '../core/MindCache';

export interface IndexedDBConfig {
  /** Database name (defaults to 'mindcache_db') */
  dbName?: string;
  /** Store name (defaults to 'mindcache_store') */
  storeName?: string;
  /** Storage key (defaults to 'mindcache_data') */
  key?: string;
  /** Debounce time in ms for saving (defaults to 1000) */
  debounceMs?: number;
}

export class IndexedDBAdapter {
  private mindcache: MindCache | null = null;
  private unsubscribe: (() => void) | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private db: IDBDatabase | null = null;

  private dbName: string;
  private storeName: string;
  private key: string;

  constructor(private config: IndexedDBConfig = {}) {
    this.dbName = config.dbName || 'mindcache_db';
    this.storeName = config.storeName || 'mindcache_store';
    this.key = config.key || 'mindcache_data';
  }

  async attach(mc: MindCache): Promise<void> {
    if (this.mindcache) {
      this.detach();
    }

    this.mindcache = mc;
    await this.initDB();
    await this.load();

    const listener = () => {
      this.scheduleSave();
    };

    mc.subscribeToAll(listener);
    this.unsubscribe = () => mc.unsubscribeFromAll(listener);
    console.log('🗄️ IndexedDBAdapter: Attached to MindCache instance');
  }

  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.mindcache = null;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('MindCache: IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private load(): Promise<void> {
    if (!this.db || !this.mindcache) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(this.key);

        request.onsuccess = () => {
          if (request.result) {
            this.mindcache!.deserialize(request.result);
            console.log('🗄️ IndexedDBAdapter: Loaded data from IndexedDB');
          }
          resolve();
        };

        request.onerror = () => {
          console.error('MindCache: Failed to load from IndexedDB:', request.error);
          resolve(); // Resolve anyway to avoid blocking initialization
        };
      } catch (error) {
        console.error('MindCache: Error accessing IndexedDB for load:', error);
        resolve();
      }
    });
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.save();
      this.saveTimeout = null;
    }, this.config.debounceMs ?? 1000);
  }

  private save(): void {
    if (!this.db || !this.mindcache) {
      return;
    }

    try {
      const data = this.mindcache.serialize();
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data, this.key);

      request.onsuccess = () => {
        console.log('🗄️ IndexedDBAdapter: Saved to IndexedDB');
      };

      request.onerror = () => {
        console.error('MindCache: Failed to save to IndexedDB:', request.error);
      };
    } catch (error) {
      console.error('MindCache: Error accessing IndexedDB for save:', error);
    }
  }
}
