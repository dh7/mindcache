/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { KeyAttributes, STM, Listener, GlobalListener, AccessLevel, SystemTag } from './types';
import { DEFAULT_KEY_ATTRIBUTES } from './types';

// Browser environment type declarations
interface FileReaderType {
  onload: ((this: FileReaderType, ev: any) => any) | null;
  onerror: ((this: FileReaderType, ev: any) => any) | null;
  result: string | ArrayBuffer | null;
  readAsDataURL(file: Blob): void;
}

declare const FileReader: {
  prototype: FileReaderType;
  new(): FileReaderType;
} | undefined;

/**
 * Cloud configuration options for MindCache constructor
 */
export interface MindCacheCloudOptions {
  /** Instance ID to connect to */
  instanceId: string;
  /** Project ID (optional, defaults to 'default') */
  projectId?: string;
  /** API endpoint to fetch WS token (recommended for browser) */
  tokenEndpoint?: string;
  /** Direct API key (server-side only, never expose in browser!) */
  apiKey?: string;
  /** WebSocket base URL (defaults to production) */
  baseUrl?: string;
}

export interface MindCacheIndexedDBOptions {
  /** Database name (defaults to 'mindcache_db') */
  dbName?: string;
  /** Store name (defaults to 'mindcache_store') */
  storeName?: string;
  /** Storage key (defaults to 'mindcache_data') */
  key?: string;
  /** Debounce time in ms for saving (defaults to 1000) */
  debounceMs?: number;
}

/**
 * Constructor options for MindCache
 */
export interface MindCacheOptions {
  /** Cloud sync configuration. If omitted, runs in local-only mode. */
  cloud?: MindCacheCloudOptions;
  /** IndexedDB configuration */
  indexedDB?: MindCacheIndexedDBOptions;
  /** Access level for tag operations. 'system' allows managing system tags. */
  accessLevel?: AccessLevel;
}

// Connection state type
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// CloudAdapter interface to avoid circular imports
interface ICloudAdapter {
  attach(mc: MindCache): void;
  detach(): void;
  connect(): Promise<void>;
  disconnect(): void;
  setTokenProvider(provider: () => Promise<string>): void;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  state: ConnectionState;
}

export class MindCache {
  // Public doc for adapter access
  public doc: Y.Doc;
  private rootMap: Y.Map<Y.Map<any>>; // Key -> EntryMap({value, attributes})

  // Cache listeners
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: GlobalListener[] = [];

  // Metadata
  public readonly version = '3.0.0';

  // Internal flag to prevent sync loops when receiving remote updates
  // (Less critical with Yjs but kept for API compat)
  private _isRemoteUpdate = false;

  private normalizeSystemTags(tags: SystemTag[]): SystemTag[] {
    const normalized: SystemTag[] = [];
    let hasSystemPrompt = false;
    let hasLLMRead = false;
    let hasLLMWrite = false;
    let hasReadonly = false;

    // First pass: identify what we have
    for (const tag of tags) {
      if (tag === 'SystemPrompt' || tag === 'prompt') {
        hasSystemPrompt = true;
      } else if (tag === 'LLMRead') {
        hasLLMRead = true;
      } else if (tag === 'LLMWrite') {
        hasLLMWrite = true;
      } else if (tag === 'readonly') {
        hasReadonly = true;
      } else if (tag === 'protected') {
        normalized.push(tag);
      } else if (tag === 'ApplyTemplate' || tag === 'template') {
        normalized.push('ApplyTemplate');
      }
    }

    // Add normalized tags
    if (hasSystemPrompt) {
      normalized.push('SystemPrompt');
    }
    if (hasLLMRead) {
      normalized.push('LLMRead');
    }

    if (hasReadonly) {
      normalized.push('readonly');
    } else if (hasLLMWrite) {
      normalized.push('LLMWrite');
    } else {
      normalized.push('LLMWrite');
    }

    return normalized;
  }

  // Cloud sync state
  private _cloudAdapter: ICloudAdapter | null = null;
  private _connectionState: ConnectionState = 'disconnected';
  private _isLoaded = true; // Default true for local mode
  private _cloudConfig: MindCacheCloudOptions | null = null;

  // Access level for system operations
  private _accessLevel: AccessLevel = 'user';

  private _initPromise: Promise<void> | null = null;

  // Y-IndexedDB provider
  private _idbProvider: IndexeddbPersistence | null = null;

  // Undo Managers Cache
  private _undoManagers: Map<string, Y.UndoManager> = new Map();

  constructor(options?: MindCacheOptions) {
    // Initialize Yjs
    this.doc = new Y.Doc();
    this.rootMap = this.doc.getMap('mindcache');

    // Observers for local reactivity
    this.rootMap.observe((event: Y.YMapEvent<any>) => {
      // Iterate changes and trigger specific key listeners
      event.keysChanged.forEach(key => {
        const entryMap = this.rootMap.get(key);
        if (entryMap) {
          // Determine value
          const value = entryMap.get('value');
          // Trigger listener
          if (this.listeners[key]) {
            this.listeners[key].forEach(l => l(value));
          }
        } else {
          // Deleted
          if (this.listeners[key]) {
            this.listeners[key].forEach(l => l(undefined));
          }
        }
      });
    });

    // Deep observer for global listener (so UI updates on any change)
    this.rootMap.observeDeep((_events: Y.YEvent<any>[]) => {
      this.notifyGlobalListeners();
    });

    if (options?.accessLevel) {
      this._accessLevel = options.accessLevel;
    }

    const initPromises: Promise<void>[] = [];

    if (options?.cloud) {
      this._cloudConfig = options.cloud;
      this._isLoaded = false; // Wait for sync
      this._connectionState = 'disconnected';
      initPromises.push(this._initCloud());
    }

    if (options?.indexedDB) {
      // Use y-indexeddb
      this._isLoaded = false;
      initPromises.push(this._initYIndexedDB(options.indexedDB.dbName || 'mindcache_yjs_db'));
    }

    if (initPromises.length > 0) {
      this._initPromise = Promise.all(initPromises).then(() => {
        // Only set loaded if not waiting for cloud or if cloud is effectively initialized?
        // Actually, logic is: if local IDB is used, we wait for it.
        // If cloud is used, we wait for 'synced' event or timeout/cache loaded.
        // For simplicity, we mark loaded when initial hydration promises resolve.
        if (!this._cloudConfig) {
          this._isLoaded = true;
        }
      });
    }
  }

  // Helper: Get or Create UndoManager for a key
  private getUndoManager(key: string): Y.UndoManager | undefined {
    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return undefined;
    }

    if (!this._undoManagers.has(key)) {
      const um = new Y.UndoManager(entryMap, {
        captureTimeout: 500
      });
      this._undoManagers.set(key, um);
    }
    return this._undoManagers.get(key);
  }

  /**
   * Undo changes for a specific key
   */
  undo(key: string): void {
    const um = this.getUndoManager(key);
    if (um) {
      um.undo();
    }
  }

  /**
   * Redo changes for a specific key
   */
  redo(key: string): void {
    const um = this.getUndoManager(key);
    if (um) {
      um.redo();
    }
  }

  getHistory(key: string): any[] {
    const um = this.getUndoManager(key);
    if (!um) {
      return [];
    }
    return um.undoStack;
  }

  get accessLevel(): AccessLevel {
    return this._accessLevel;
  }

  get hasSystemAccess(): boolean {
    return this._accessLevel === 'system';
  }

  private async _initCloud(): Promise<void> {
    if (!this._cloudConfig) {
      return;
    }

    // Dynamic import to avoid bundling CloudAdapter in small builds if technically possible (though explicit import used here)
    const CloudAdapter = await this._getCloudAdapterClass();

    if (!this._cloudConfig.baseUrl) {
      // Warning or error?
      // throw new Error('MindCache Cloud: baseUrl is required.');
    }

    // Ensure baseUrl is set or fallback
    const baseUrl = (this._cloudConfig.baseUrl || 'https://api.mindcache.io')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    const adapter = new CloudAdapter({
      instanceId: this._cloudConfig.instanceId,
      projectId: this._cloudConfig.projectId || 'default',
      baseUrl,
      apiKey: this._cloudConfig.apiKey
    });

    if (this._cloudConfig.tokenEndpoint) {
      const tokenEndpoint = this._cloudConfig.tokenEndpoint;
      const instanceId = this._cloudConfig.instanceId;
      let resolvedBaseUrl: string;
      if (tokenEndpoint.startsWith('http://') || tokenEndpoint.startsWith('https://')) {
        resolvedBaseUrl = tokenEndpoint;
      } else if (typeof window !== 'undefined' && window.location?.origin) {
        resolvedBaseUrl = `${window.location.origin}${tokenEndpoint.startsWith('/') ? '' : '/'}${tokenEndpoint}`;
      } else {
        resolvedBaseUrl = tokenEndpoint;
      }
      adapter.setTokenProvider(async () => {
        const url = resolvedBaseUrl.includes('?')
          ? `${resolvedBaseUrl}&instanceId=${instanceId}`
          : `${resolvedBaseUrl}?instanceId=${instanceId}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to get token');
        }
        const data = await response.json();
        return data.token;
      });
    }

    adapter.on('connected', () => {
      this._connectionState = 'connected';
      this.notifyGlobalListeners();
    });

    adapter.on('disconnected', () => {
      this._connectionState = 'disconnected';
      this.notifyGlobalListeners();
    });

    adapter.on('error', () => {
      this._connectionState = 'error';
      this.notifyGlobalListeners();
    });

    adapter.on('synced', () => {
      this._isLoaded = true;
      this.notifyGlobalListeners();
    });

    adapter.attach(this);
    this._cloudAdapter = adapter;
    this._connectionState = 'connecting';
    adapter.connect();
  }

  private async _initYIndexedDB(dbName: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    this._idbProvider = new IndexeddbPersistence(dbName, this.doc);
    return new Promise<void>(resolve => {
      if (!this._idbProvider) {
        return resolve();
      }
      this._idbProvider.on('synced', () => {
        this._isLoaded = true;
        resolve();
      });
    });
  }

  // Legacy IndexedDB method stub
  private async _initIndexedDB(_config: MindCacheIndexedDBOptions): Promise<void> {
    // Replaced by Y-IndexedDB in constructor
  }

  protected async _getIndexedDBAdapterClass(): Promise<any> {
    // Legacy support
    const { IndexedDBAdapter } = await import('../local/IndexedDBAdapter');
    return IndexedDBAdapter;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  protected async _getCloudAdapterClass(): Promise<any> {
    const { CloudAdapter } = await import('../cloud/CloudAdapter');
    return CloudAdapter;
  }

  get isCloud(): boolean {
    return this._cloudConfig !== null;
  }

  async waitForSync(): Promise<void> {
    if (this._isLoaded) {
      return;
    }
    if (this._initPromise) {
      await this._initPromise;
    }
    if (this._isLoaded) {
      return;
    }

    // Poll or wait for event?
    // Simple version:
    return new Promise<void>((resolve) => {
      if (this._isLoaded) {
        return resolve();
      }
      // A bit hacky, but robust enough for now
      const interval = setInterval(() => {
        if (this._isLoaded) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  disconnect(): void {
    if (this._cloudAdapter) {
      this._cloudAdapter.disconnect();
      this._cloudAdapter.detach();
      this._cloudAdapter = null;
      this._connectionState = 'disconnected';
    }
    if (this._idbProvider) {
      this._idbProvider.destroy();
      this._idbProvider = null;
    }
  }

  // Legacy bridge
  isRemoteUpdate(): boolean {
    return false;
  }

  // Serialize state
  serialize(): STM {
    const json: STM = {};
    for (const [key, val] of this.rootMap) {
      const entryMap = val as Y.Map<any>;
      json[key] = {
        value: entryMap.get('value'),
        attributes: entryMap.get('attributes')
      };
    }
    return json;
  }

  // Deserialize state (for IndexedDBAdapter compatibility)
  deserialize(data: STM): void {
    this.doc.transact(() => {
      for (const [key, entry] of Object.entries(data)) {
        if (key.startsWith('$')) {
          continue;
        } // Skip reserved keys
        let entryMap = this.rootMap.get(key);
        if (!entryMap) {
          entryMap = new Y.Map();
          this.rootMap.set(key, entryMap);
        }
        entryMap.set('value', entry.value);
        entryMap.set('attributes', entry.attributes);
      }
    });
  }

  private encodeFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        reject(new Error('FileReader not available in Node.js environment. Use set_base64() method instead.'));
      }
    });
  }

  private createDataUrl(base64Data: string, contentType: string): string {
    return `data:${contentType};base64,${base64Data}`;
  }

  private validateContentType(type: KeyAttributes['type'], contentType?: string): boolean {
    if (type === 'text' || type === 'json') {
      return true;
    }
    if (!contentType) {
      return false;
    }
    if (type === 'image') {
      return contentType.startsWith('image/');
    }
    if (type === 'file') {
      return true;
    }
    return false;
  }

  // InjectSTM replacement
  private injectSTM(template: string, _processingStack: Set<string>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const val = this.get_value(key.trim(), _processingStack);
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  // Public API Methods

  getAll(): STM {
    return this.serialize();
  }

  get_value(key: string, _processingStack?: Set<string>): any {
    if (key === '$date') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    if (key === '$time') {
      const now = new Date();
      return now.toTimeString().split(' ')[0];
    }
    if (key === '$version') {
      return this.version;
    }

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return undefined;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const value = entryMap.get('value');

    // Recursion check for templates
    if (_processingStack && _processingStack.has(key)) {
      return `{{${key}}}`; // Break cycle
    }

    // Apply Template Logic
    if (attributes?.systemTags?.includes('ApplyTemplate') || attributes?.systemTags?.includes('template') || attributes?.template) {
      if (typeof value === 'string') {
        const stack = _processingStack || new Set();
        stack.add(key);
        return this.injectSTM(value, stack);
      }
    }
    return value;
  }

  get_attributes(key: string): KeyAttributes | undefined {
    if (key === '$date' || key === '$time' || key === '$version') {
      return {
        type: 'text',
        contentTags: [],
        systemTags: ['prompt', 'readonly', 'protected'],
        zIndex: 999999,
        readonly: true,
        visible: true,
        hardcoded: true,
        template: false,
        tags: []
      };
    }
    const entryMap = this.rootMap.get(key);
    return entryMap ? entryMap.get('attributes') : undefined;
  }

  set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void {
    if (key === '$date' || key === '$time' || key === '$version') {
      return;
    }

    // Check if we need to create a new entry (outside transaction for UndoManager setup)
    let entryMap = this.rootMap.get(key);
    const isNewEntry = !entryMap;

    if (isNewEntry) {
      // Create and attach to rootMap first (so UndoManager can be attached)
      entryMap = new Y.Map();
      this.rootMap.set(key, entryMap);
    }

    // Ensure UndoManager exists BEFORE making changes
    this.getUndoManager(key);

    // Now make changes inside a transaction (these will be tracked)
    this.doc.transact(() => {
      const oldAttributes = isNewEntry
        ? {
          ...DEFAULT_KEY_ATTRIBUTES,
          contentTags: [],
          systemTags: ['SystemPrompt', 'LLMWrite'] as SystemTag[],
          tags: [],
          zIndex: 0
        }
        : entryMap!.get('attributes');

      const finalAttributes = attributes ? { ...oldAttributes, ...attributes } : oldAttributes;

      let normalizedAttributes = { ...finalAttributes };
      if (finalAttributes.systemTags) {
        normalizedAttributes.systemTags = this.normalizeSystemTags(finalAttributes.systemTags);
      }
      if (finalAttributes.template) {
        if (!normalizedAttributes.systemTags.includes('template')) {
          normalizedAttributes.systemTags.push('template');
        }
      }

      entryMap!.set('value', value);
      entryMap!.set('attributes', normalizedAttributes);
    });
  }

  delete_key(key: string): void {
    if (key === '$date' || key === '$time') {
      return;
    }
    this.rootMap.delete(key);
  }

  clear(): void {
    const keys = Array.from(this.rootMap.keys());
    this.doc.transact(() => {
      keys.forEach(k => this.rootMap.delete(k));
    });
  }

  // File methods
  async set_file(key: string, file: File, attributes?: Partial<KeyAttributes>): Promise<void> {
    const base64 = await this.encodeFileToBase64(file);
    const dataUrl = this.createDataUrl(base64, file.type);

    this.set_value(key, dataUrl, {
      ...attributes,
      type: 'file',
      contentType: file.type
    });
  }

  set_image(key: string, file: File, attributes?: Partial<KeyAttributes>): Promise<void> {
    return this.set_file(key, file, {
      ...attributes,
      type: 'image' // Override to image
    });
  }

  // ... (subscribe methods)
  subscribe(key: string, listener: Listener): () => void {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(listener);
    return () => {
      this.listeners[key] = this.listeners[key].filter(l => l !== listener);
    };
  }

  subscribeToAll(listener: GlobalListener): () => void {
    this.globalListeners.push(listener);
    return () => {
      this.globalListeners = this.globalListeners.filter(l => l !== listener);
    };
  }

  unsubscribeFromAll(listener: GlobalListener): void {
    this.globalListeners = this.globalListeners.filter(l => l !== listener);
  }

  private notifyGlobalListeners(): void {
    this.globalListeners.forEach(l => l());
  }

  // Internal method stub for legacy compatibility
  _setFromRemote(_key: string, _value: any, _attributes: KeyAttributes): void {
    // Legacy - no op as Yjs handles it
  }
  _deleteFromRemote(_key: string): void {
    // Legacy - no op as Yjs handles it
  }
  _clearFromRemote(): void {
    // Legacy - no op as Yjs handles it
  }
}
