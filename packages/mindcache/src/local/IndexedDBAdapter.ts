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
      if (this.mindcache) {
        this.scheduleSave();
      }
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
      const request = indexedDB.open(this.dbName);

      request.onerror = () => {
        console.error('MindCache: IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const db = request.result;

        // Check if the required store exists
        if (!db.objectStoreNames.contains(this.storeName)) {
          // Store doesn't exist - need to trigger upgrade
          const currentVersion = db.version;
          db.close();

          // Reopen with incremented version to trigger onupgradeneeded
          const upgradeRequest = indexedDB.open(this.dbName, currentVersion + 1);

          upgradeRequest.onerror = () => {
            console.error('MindCache: IndexedDB upgrade error:', upgradeRequest.error);
            reject(upgradeRequest.error);
          };

          upgradeRequest.onupgradeneeded = () => {
            const upgradeDb = upgradeRequest.result;
            if (!upgradeDb.objectStoreNames.contains(this.storeName)) {
              upgradeDb.createObjectStore(this.storeName);
            }
          };

          upgradeRequest.onsuccess = () => {
            this.db = upgradeRequest.result;
            resolve();
          };
        } else {
          this.db = db;
          resolve();
        }
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
          resolve();
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
