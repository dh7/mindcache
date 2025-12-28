/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import diff from 'fast-diff';
import type { KeyAttributes, STM, Listener, GlobalListener, AccessLevel, SystemTag, HistoryEntry, HistoryOptions, ContextRules } from './types';
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
  /** Function to fetch token dynamically (overrides tokenEndpoint) */
  tokenProvider?: () => Promise<string>;
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
  /** Cloud sync configuration. If omitted, runs in local-only mode. IndexedDB auto-enabled for offline support. */
  cloud?: MindCacheCloudOptions;
  /** IndexedDB configuration. Ignored in cloud mode (auto-enabled). */
  indexedDB?: MindCacheIndexedDBOptions;
  /** History tracking options (enabled in IndexedDB and Cloud modes) */
  history?: HistoryOptions;
  /** Access level for tag operations. 'admin' allows managing system tags. */
  accessLevel?: AccessLevel;
  /** Optional existing Y.Doc instance (for server-side hydration) */
  doc?: Y.Doc;
  /** Context filtering rules. When set, only keys matching the rules are visible. */
  context?: ContextRules;
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
  isOnline: boolean;
}

export class MindCache {
  // Public doc for adapter access
  public doc: Y.Doc;
  private rootMap: Y.Map<Y.Map<any>>; // Key -> EntryMap({value, attributes})

  // Cache listeners
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: GlobalListener[] = [];

  // Metadata
  public readonly version = '3.3.2';

  // Internal flag to prevent sync loops when receiving remote updates
  // (Less critical with Yjs but kept for API compat)


  private normalizeSystemTags(tags: SystemTag[]): SystemTag[] {
    const normalized: SystemTag[] = [];
    const seen = new Set<SystemTag>();

    for (const tag of tags) {
      // Only include valid SystemTag values, skip duplicates
      if (['SystemPrompt', 'LLMRead', 'LLMWrite', 'protected', 'ApplyTemplate'].includes(tag)) {
        if (!seen.has(tag)) {
          seen.add(tag);
          normalized.push(tag);
        }
      }
    }

    return normalized;
  }

  // Cloud sync state
  private _cloudAdapter: ICloudAdapter | null = null;
  private _connectionState: ConnectionState = 'disconnected';
  private _isLoaded = true; // Default true for local mode
  private _cloudConfig: MindCacheCloudOptions | null = null;

  // Access level for admin operations
  private _accessLevel: AccessLevel = 'user';

  // Context filtering (client-local, not persisted)
  private _contextRules: ContextRules | null = null;

  private _initPromise: Promise<void> | null = null;

  // Y-IndexedDB provider
  private _idbProvider: IndexeddbPersistence | null = null;

  // Undo Managers Cache
  private _undoManagers: Map<string, Y.UndoManager> = new Map();

  // Global Undo Manager (watches entire rootMap)
  private _globalUndoManager: Y.UndoManager | null = null;

  // History tracking
  private _history: HistoryEntry[] = [];
  private _historyOptions: HistoryOptions = { maxEntries: 100, snapshotInterval: 10 };
  private _historyEnabled = false;

  constructor(options?: MindCacheOptions) {
    // Initialize Yjs (use provided doc or create new)
    this.doc = options?.doc || new Y.Doc();
    this.rootMap = this.doc.getMap('mindcache');

    // Deep observer for both key-specific and global listeners
    // Using observeDeep to catch both root-level key add/remove AND nested value changes
    this.rootMap.observeDeep((events: Y.YEvent<any>[]) => {
      const keysAffected = new Set<string>();

      events.forEach(event => {
        if (event.target === this.rootMap) {
          // Direct changes to rootMap (key added/removed)
          const mapEvent = event as Y.YMapEvent<any>;
          mapEvent.keysChanged.forEach(key => keysAffected.add(key));
        } else if (event.target.parent === this.rootMap) {
          // Changes to nested entry maps (value/attributes changed)
          for (const [key, val] of this.rootMap) {
            if (val === event.target) {
              keysAffected.add(key);
              break;
            }
          }
        } else {
          // Deep changes (e.g., Y.Text changes inside entryMap)
          // Walk up the parent chain to find the key
          let current = event.target;
          while (current && current.parent) {
            if (current.parent.parent === this.rootMap) {
              // current.parent is the entryMap
              for (const [key, val] of this.rootMap) {
                if (val === current.parent) {
                  keysAffected.add(key);
                  break;
                }
              }
              break;
            }
            current = current.parent;
          }
        }
      });

      // Trigger key-specific listeners
      keysAffected.forEach(key => {
        const entryMap = this.rootMap.get(key);
        if (entryMap) {
          const value = entryMap.get('value');
          const attrs = entryMap.get('attributes') as KeyAttributes;
          // For document types, convert Y.Text to string
          const resolvedValue = (attrs?.type === 'document' && value instanceof Y.Text)
            ? value.toString()
            : value;
          if (this.listeners[key]) {
            this.listeners[key].forEach(l => l(resolvedValue));
          }
        } else {
          // Deleted
          if (this.listeners[key]) {
            this.listeners[key].forEach(l => l(undefined));
          }
        }
      });

      // Trigger global listeners
      this.notifyGlobalListeners();
    });

    // Initialize global undo manager immediately to capture all changes from start
    this.initGlobalUndoManager();

    if (options?.accessLevel) {
      this._accessLevel = options.accessLevel;
    }

    // Initialize context from options
    if (options?.context) {
      this._contextRules = options.context;
    }

    const initPromises: Promise<void>[] = [];

    if (options?.cloud) {
      this._cloudConfig = options.cloud;
      this._isLoaded = false; // Wait for sync
      this._connectionState = 'disconnected';
      initPromises.push(this._initCloud());

      // Auto-enable IndexedDB for offline support in cloud mode
      if (typeof window !== 'undefined') {
        const dbName = `mindcache_cloud_${options.cloud.instanceId}`;
        initPromises.push(this._initYIndexedDB(dbName));
      }

      // Enable history tracking in cloud mode
      this.enableHistory(options.history);
    }

    // Only use explicit indexedDB config if NOT in cloud mode
    if (options?.indexedDB && !options?.cloud) {
      // Use y-indexeddb
      this._isLoaded = false;
      initPromises.push(this._initYIndexedDB(options.indexedDB.dbName || 'mindcache_yjs_db'));

      // Enable history tracking in offline mode
      this.enableHistory(options.history);
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

  // Initialize global undo manager (watches entire rootMap)
  private initGlobalUndoManager(): void {
    if (!this._globalUndoManager) {
      this._globalUndoManager = new Y.UndoManager(this.rootMap, {
        captureTimeout: 500
      });
    }
  }

  /**
   * Undo all recent local changes (across all keys)
   * Only undoes YOUR changes, not changes from other users in cloud mode
   */
  undoAll(): void {
    this.initGlobalUndoManager();
    this._globalUndoManager?.undo();
  }

  /**
   * Redo previously undone local changes
   */
  redoAll(): void {
    this.initGlobalUndoManager();
    this._globalUndoManager?.redo();
  }

  /**
   * Check if there are changes to undo globally
   */
  canUndoAll(): boolean {
    this.initGlobalUndoManager();
    return (this._globalUndoManager?.undoStack.length ?? 0) > 0;
  }

  /**
   * Check if there are changes to redo globally
   */
  canRedoAll(): boolean {
    this.initGlobalUndoManager();
    return (this._globalUndoManager?.redoStack.length ?? 0) > 0;
  }

  // Enable history tracking (called for IndexedDB and Cloud modes)
  private enableHistory(options?: HistoryOptions): void {
    if (this._historyEnabled) {
      return;
    }

    this._historyEnabled = true;
    if (options) {
      this._historyOptions = { ...this._historyOptions, ...options };
    }

    // Track changes to record history
    this.rootMap.observeDeep((events: Y.YEvent<any>[]) => {
      // Determine which keys were affected
      const keysAffected = new Set<string>();
      events.forEach(event => {
        if (event.target === this.rootMap) {
          // Direct changes to rootMap (key added/removed)
          const mapEvent = event as Y.YMapEvent<any>;
          mapEvent.keysChanged.forEach(key => keysAffected.add(key));
        } else {
          // Changes to nested structures (entry maps or Y.Text inside them)
          // Walk up the parent chain to find which root key was affected
          let current = event.target;
          while (current && current.parent) {
            if (current.parent === this.rootMap) {
              // Found the entry map - now find which key it belongs to
              for (const [key, val] of this.rootMap) {
                if (val === current) {
                  keysAffected.add(key);
                  break;
                }
              }
              break;
            }
            current = current.parent;
          }
        }
      });

      if (keysAffected.size > 0) {
        const entry: HistoryEntry = {
          id: this.generateId(),
          timestamp: Date.now(),
          keysAffected: Array.from(keysAffected)
        };

        this._history.push(entry);

        // Trim old entries
        const max = this._historyOptions.maxEntries || 100;
        if (this._history.length > max) {
          this._history = this._history.slice(-max);
        }
      }
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get global history of all changes (available in IndexedDB and Cloud modes)
   */
  getGlobalHistory(): HistoryEntry[] {
    return [...this._history];
  }

  /**
   * Check if history tracking is enabled
   */
  get historyEnabled(): boolean {
    return this._historyEnabled;
  }

  /**
   * Restore to a specific version (time travel)
   * Note: Full implementation requires storing update binaries, which is not yet implemented.
   * @returns false - not yet fully implemented
   */
  restoreToVersion(_versionId: string): boolean {
    console.warn('restoreToVersion: Full implementation requires storing update binaries. Not yet implemented.');
    return false;
  }

  get accessLevel(): AccessLevel {
    return this._accessLevel;
  }

  get hasSystemAccess(): boolean {
    return this._accessLevel === 'admin';
  }

  // ============================================
  // Context Methods (client-local filtering)
  // ============================================

  /**
   * Check if context filtering is currently active.
   */
  get hasContext(): boolean {
    return this._contextRules !== null;
  }

  /**
   * Get current context rules, or null if no context is set.
   */
  get_context(): ContextRules | null {
    return this._contextRules;
  }

  /**
   * Set context filtering rules.
   * When context is set, only keys with ALL specified tags are visible.
   *
   * @param rules - Context rules, or array of tags (shorthand for { tags: [...] })
   */
  set_context(rules: ContextRules | string[]): void {
    if (Array.isArray(rules)) {
      this._contextRules = { tags: rules };
    } else {
      this._contextRules = rules;
    }
  }

  /**
   * Clear context filtering. All keys become visible again.
   */
  reset_context(): void {
    this._contextRules = null;
  }

  /**
   * Check if a key matches the current context rules.
   * Returns true if no context is set.
   */
  private keyMatchesContext(key: string): boolean {
    // System keys always match
    if (key.startsWith('$')) {
      return true;
    }

    // No context = all keys match
    if (!this._contextRules) {
      return true;
    }

    // If no tags required, all keys match
    if (this._contextRules.tags.length === 0) {
      return true;
    }

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attrs = entryMap.get('attributes') as KeyAttributes;
    const contentTags = attrs?.contentTags || [];

    // AND logic: key must have ALL specified tags
    return this._contextRules.tags.every(tag => contentTags.includes(tag));
  }

  /**
   * Create a new key with optional default tags from context.
   *
   * @throws Error if key already exists
   */
  create_key(key: string, value: any, attributes?: Partial<KeyAttributes>): void {

    if (this.rootMap.has(key)) {
      throw new Error(`Key already exists: ${key}. Use set_value to update.`);
    }

    // Merge context defaults with provided attributes
    let finalAttributes: Partial<KeyAttributes> = { ...attributes };

    if (this._contextRules) {
      // Add default content tags from context
      const contextContentTags = this._contextRules.defaultContentTags || this._contextRules.tags;
      const existingContentTags = finalAttributes.contentTags || [];
      finalAttributes.contentTags = [...new Set([...existingContentTags, ...contextContentTags])];

      // Add default system tags from context
      if (this._contextRules.defaultSystemTags) {
        const existingSystemTags = finalAttributes.systemTags || [];
        finalAttributes.systemTags = [...new Set([...existingSystemTags, ...this._contextRules.defaultSystemTags])] as SystemTag[];
      }
    }

    // Create the key
    const entryMap = new Y.Map();
    this.rootMap.set(key, entryMap);

    // Ensure UndoManager exists
    this.getUndoManager(key);

    this.doc.transact(() => {
      const baseAttributes = {
        ...DEFAULT_KEY_ATTRIBUTES,
        ...finalAttributes
      };

      // Normalize system tags
      if (baseAttributes.systemTags) {
        baseAttributes.systemTags = this.normalizeSystemTags(baseAttributes.systemTags);
      }

      // Handle document type
      let valueToSet = value;
      if (baseAttributes.type === 'document' && !(valueToSet instanceof Y.Text)) {
        valueToSet = new Y.Text(typeof value === 'string' ? value : String(value ?? ''));
      }

      entryMap.set('value', valueToSet);
      entryMap.set('attributes', baseAttributes);
    });
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

    // Ensure baseUrl is set or fallback to production
    const baseUrl = (this._cloudConfig.baseUrl || 'https://api.mindcache.dev')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    const adapter = new CloudAdapter({
      instanceId: this._cloudConfig.instanceId,
      projectId: this._cloudConfig.projectId || 'default',
      baseUrl,
      apiKey: this._cloudConfig.apiKey
    });

    if (this._cloudConfig.tokenProvider) {
      adapter.setTokenProvider(this._cloudConfig.tokenProvider);
    } else if (this._cloudConfig.tokenEndpoint) {
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

  /**
   * Browser network status. Returns true if online or in local-only mode.
   * In cloud mode, this updates instantly when network status changes.
   */
  get isOnline(): boolean {
    if (!this._cloudAdapter) {
      // Local mode - check navigator directly or assume online
      if (typeof navigator !== 'undefined') {
        return navigator.onLine;
      }
      return true;
    }
    return this._cloudAdapter.isOnline;
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



  // Serialize state
  serialize(): STM {
    const json: STM = {};
    for (const [key, val] of this.rootMap) {
      const entryMap = val as Y.Map<any>;
      const attrs = entryMap.get('attributes') as KeyAttributes;
      let value = entryMap.get('value');

      // Convert Y.Text to string for serialization
      if (attrs?.type === 'document' && value instanceof Y.Text) {
        value = value.toString();
      }

      json[key] = {
        value,
        attributes: attrs
      };
    }
    return json;
  }

  // Deserialize state (for IndexedDBAdapter compatibility)
  deserialize(data: STM): void {
    if (!data || typeof data !== 'object') {
      return; // Handle null/undefined gracefully
    }
    this.doc.transact(() => {
      // Clear existing data first
      for (const key of this.rootMap.keys()) {
        this.rootMap.delete(key);
      }
      // Then load new data
      for (const [key, entry] of Object.entries(data)) {
        if (key.startsWith('$')) {
          continue;
        } // Skip reserved keys
        const entryMap = new Y.Map();
        this.rootMap.set(key, entryMap);
        entryMap.set('value', entry.value);
        // Normalize attributes (fill in missing fields with defaults)
        // Type as any to allow accessing legacy 'tags' property for migration
        const attrs: any = entry.attributes || {};
        // Migrate legacy 'tags' to 'contentTags'
        const contentTags = attrs.contentTags || attrs.tags || [];
        const normalizedAttrs: KeyAttributes = {
          type: attrs.type || 'text',
          contentType: attrs.contentType,
          contentTags: contentTags,
          systemTags: this.normalizeSystemTags(attrs.systemTags || []),
          zIndex: attrs.zIndex ?? 0
        };
        entryMap.set('attributes', normalizedAttrs);
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

  // InjectSTM replacement (private helper)
  // Handles special template variables: $date, $time, $version
  private _injectSTMInternal(template: string, _processingStack: Set<string>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const trimmedKey = key.trim();

      // Handle special template variables
      if (trimmedKey === '$date') {
        return new Date().toISOString().split('T')[0];
      }
      if (trimmedKey === '$time') {
        return new Date().toTimeString().split(' ')[0];
      }
      if (trimmedKey === '$version') {
        return this.version;
      }

      const val = this.get_value(trimmedKey, _processingStack);
      // Replace missing keys with empty string (standard template engine behavior)
      return val !== undefined ? String(val) : '';
    });
  }

  /**
   * Replace {{key}} placeholders in a template string with values from MindCache.
   * @param template The template string with {{key}} placeholders
   * @returns The template with placeholders replaced by values
   */
  injectSTM(template: string): string {
    return this._injectSTMInternal(template, new Set());
  }

  // Public API Methods

  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key] of this.rootMap) {
      if (this.keyMatchesContext(key)) {
        result[key] = this.get_value(key);
      }
    }
    return result;
  }

  /**
   * Get all entries with their full structure (value + attributes).
   * Use this for UI/admin interfaces that need to display key properties.
   * Unlike serialize(), this format is stable and won't change.
   */
  getAllEntries(): STM {
    const result: STM = {};
    for (const [key] of this.rootMap) {
      if (this.keyMatchesContext(key)) {
        const value = this.get_value(key);
        const attributes = this.get_attributes(key);
        if (attributes) {
          result[key] = { value, attributes };
        }
      }
    }
    return result;
  }

  get_value(key: string, _processingStack?: Set<string>): any {
    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return undefined;
    }

    // Check context filtering
    if (!this.keyMatchesContext(key)) {
      return undefined;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const value = entryMap.get('value');

    // For document type, return plain text representation
    if (attributes?.type === 'document' && value instanceof Y.Text) {
      return value.toString();
    }

    // Recursion check for templates
    if (_processingStack && _processingStack.has(key)) {
      return `{{${key}}}`; // Break cycle
    }

    // Apply Template Logic
    if (attributes?.systemTags?.includes('ApplyTemplate')) {
      if (typeof value === 'string') {
        const stack = _processingStack || new Set();
        stack.add(key);
        return this._injectSTMInternal(value, stack);
      }
    }
    return value;
  }

  get_attributes(key: string): KeyAttributes | undefined {
    const entryMap = this.rootMap.get(key);
    return entryMap ? entryMap.get('attributes') : undefined;
  }

  /**
   * Update only the attributes of a key without modifying the value.
   * Useful for updating tags, permissions etc. on document type keys.
   * @returns true if attributes were updated, false if key doesn't exist or is protected
   */
  set_attributes(key: string, attributes: Partial<KeyAttributes>): boolean {

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false; // Key doesn't exist
    }

    // Context validation: can't modify key that doesn't match context
    if (this._contextRules && !this.keyMatchesContext(key)) {
      throw new Error(`Cannot modify key "${key}": does not match current context`);
    }

    this.doc.transact(() => {
      const existingAttrs = entryMap.get('attributes') as KeyAttributes;
      const mergedAttrs = { ...existingAttrs, ...attributes };

      // Normalize system tags
      if (mergedAttrs.systemTags) {
        mergedAttrs.systemTags = this.normalizeSystemTags(mergedAttrs.systemTags);
      }

      entryMap.set('attributes', mergedAttrs);

      // Handle type transitions
      const currentValue = entryMap.get('value');

      // text -> document transition
      if (mergedAttrs.type === 'document' && !(currentValue instanceof Y.Text)) {
        const strValue = typeof currentValue === 'string' ? currentValue : String(currentValue ?? '');
        entryMap.set('value', new Y.Text(strValue));
        // Ensure undo manager is attached for the new document
        this.getUndoManager(key);
      } else if (mergedAttrs.type !== 'document' && currentValue instanceof Y.Text) {
        // document -> text transition
        entryMap.set('value', currentValue.toString());
      }
    });

    return true;
  }

  set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void {

    // For existing document type keys, use diff-based replace
    const existingEntry = this.rootMap.get(key);
    if (existingEntry) {
      // Context validation: can't modify key that doesn't match context
      if (this._contextRules && !this.keyMatchesContext(key)) {
        throw new Error(`Cannot modify key "${key}": does not match current context`);
      }

      const existingAttrs = existingEntry.get('attributes') as KeyAttributes;
      if (existingAttrs?.type === 'document') {
        // Route to _replaceDocumentText for smart diff handling
        // BUT ONLY if we are not changing the type
        if (!attributes?.type || attributes.type === 'document') {
          if (typeof value === 'string') {
            this._replaceDocumentText(key, value);
          }
          // If attributes are provided, update them too
          if (attributes) {
            this.set_attributes(key, attributes);
          }
          return;
        }
      }
    }

    // If key doesn't exist and context is set, use create_key
    if (!existingEntry && this._contextRules) {
      this.create_key(key, value, attributes);
      return;
    }

    // If creating a NEW document type, use set_document
    if (!existingEntry && attributes?.type === 'document') {
      this.set_document(key, typeof value === 'string' ? value : '', attributes);
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
          ...DEFAULT_KEY_ATTRIBUTES
        }
        : entryMap!.get('attributes');

      const finalAttributes = attributes ? { ...oldAttributes, ...attributes } : oldAttributes;

      let normalizedAttributes = { ...finalAttributes };
      if (finalAttributes.systemTags) {
        normalizedAttributes.systemTags = this.normalizeSystemTags(finalAttributes.systemTags);
      }


      // Ensure value type consistency with attributes
      let valueToSet = value;
      if (normalizedAttributes.type === 'document' && !(valueToSet instanceof Y.Text)) {
        valueToSet = new Y.Text(typeof value === 'string' ? value : String(value ?? ''));
      } else if (normalizedAttributes.type !== 'document' && valueToSet instanceof Y.Text) {
        valueToSet = valueToSet.toString();
      }

      entryMap!.set('value', valueToSet);
      entryMap!.set('attributes', normalizedAttributes);
    });
  }

  /**
   * LLM-safe method to write a value to a key.
   * This method:
   * - Only updates the value, never modifies attributes/systemTags
   * - Checks LLMWrite permission before writing
   * - Returns false if key doesn't exist or lacks LLMWrite permission
   *
   * Used by create_vercel_ai_tools() to prevent LLMs from escalating privileges.
   */
  llm_set_key(key: string, value: any): boolean {

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;

    // Check LLMWrite permission
    if (!attributes?.systemTags?.includes('LLMWrite')) {
      return false;
    }

    // For document type, use diff-based replace
    if (attributes.type === 'document') {
      if (typeof value === 'string') {
        this._replaceDocumentText(key, value);
      }
      return true;
    }

    // For other types, just update the value (NOT attributes)
    this.doc.transact(() => {
      entryMap.set('value', value);
    });

    return true;
  }

  delete_key(key: string): void {
    this.rootMap.delete(key);
  }

  clear(): void {
    const keys = Array.from(this.rootMap.keys());
    this.doc.transact(() => {
      keys.forEach(k => this.rootMap.delete(k));
    });
  }

  // ============================================
  // Restored Methods (from v2.x)
  // ============================================

  /**
   * Check if a key exists in MindCache.
   */
  has(key: string): boolean {
    if (!this.rootMap.has(key)) {
      return false;
    }
    return this.keyMatchesContext(key);
  }

  /**
   * Delete a key from MindCache.
   * @returns true if the key existed and was deleted
   */
  delete(key: string): boolean {
    if (!this.rootMap.has(key)) {
      return false;
    }
    this.rootMap.delete(key);
    this.notifyGlobalListeners();
    if (this.listeners[key]) {
      this.listeners[key].forEach(listener => listener(undefined));
    }
    return true;
  }

  /** @deprecated Use get_value instead */
  get(key: string): any {
    return this.get_value(key);
  }

  /** @deprecated Use set_value instead */
  set(key: string, value: any): void {
    this.set_value(key, value);
  }

  /**
   * Update multiple values at once from an object.
   * @deprecated Use set_value for individual keys
   */
  update(data: Record<string, any>): void {
    this.doc.transact(() => {
      for (const [key, value] of Object.entries(data)) {
        this.set_value(key, value);
      }
    });
    this.notifyGlobalListeners();
  }

  /**
   * Get the number of keys in MindCache.
   */
  size(): number {
    // Count keys that match context
    let count = 0;
    for (const [key] of this.rootMap) {
      if (this.keyMatchesContext(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all keys in MindCache.
   */
  keys(): string[] {
    const keys: string[] = [];
    for (const [key] of this.rootMap) {
      if (this.keyMatchesContext(key)) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Get all values in MindCache.
   */
  values(): any[] {
    const result: any[] = [];
    for (const [key] of this.rootMap) {
      if (this.keyMatchesContext(key)) {
        result.push(this.get_value(key));
      }
    }
    return result;
  }

  /**
   * Get all key-value entries.
   */
  entries(): Array<[string, any]> {
    const result: Array<[string, any]> = [];
    for (const [key] of this.rootMap) {
      if (this.keyMatchesContext(key)) {
        result.push([key, this.get_value(key)]);
      }
    }
    return result;
  }

  /**
   * Unsubscribe from key changes.
   * @deprecated Use the cleanup function returned by subscribe() instead
   */
  unsubscribe(key: string, listener: Listener): void {
    if (this.listeners[key]) {
      this.listeners[key] = this.listeners[key].filter(l => l !== listener);
    }
  }

  /**
   * Get the STM as a formatted string for LLM context.
   * @deprecated Use get_system_prompt() instead
   */
  getSTM(): string {
    return this.get_system_prompt();
  }

  /**
   * Get the STM as an object with values directly (no attributes).
   * @deprecated Use getAll() for full STM format
   */
  getSTMObject(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key] of this.rootMap) {
      result[key] = this.get_value(key);
    }
    return result;
  }

  /**
   * Add a content tag to a key.
   * @returns true if the tag was added, false if key doesn't exist or tag already exists
   */
  addTag(key: string, tag: string): boolean {

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const contentTags = attributes?.contentTags || [];

    if (contentTags.includes(tag)) {
      return false;
    }

    this.doc.transact(() => {
      const newContentTags = [...contentTags, tag];
      entryMap.set('attributes', {
        ...attributes,
        contentTags: newContentTags,
        tags: newContentTags // Sync legacy tags array
      });
    });

    this.notifyGlobalListeners();
    return true;
  }

  /**
   * Remove a content tag from a key.
   * @returns true if the tag was removed
   */
  removeTag(key: string, tag: string): boolean {

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const contentTags = attributes?.contentTags || [];
    const tagIndex = contentTags.indexOf(tag);

    if (tagIndex === -1) {
      return false;
    }

    this.doc.transact(() => {
      const newContentTags = contentTags.filter((t: string) => t !== tag);
      entryMap.set('attributes', {
        ...attributes,
        contentTags: newContentTags,
        tags: newContentTags // Sync legacy tags array
      });
    });

    this.notifyGlobalListeners();
    return true;
  }

  /**
   * Get all content tags for a key.
   */
  getTags(key: string): string[] {

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return [];
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.contentTags || [];
  }

  /**
   * Get all unique content tags across all keys.
   */
  getAllTags(): string[] {
    const allTags = new Set<string>();

    for (const [, val] of this.rootMap) {
      const entryMap = val as Y.Map<any>;
      const attributes = entryMap.get('attributes') as KeyAttributes;
      if (attributes?.contentTags) {
        attributes.contentTags.forEach((tag: string) => allTags.add(tag));
      }
    }

    return Array.from(allTags);
  }

  /**
   * Check if a key has a specific content tag.
   */
  hasTag(key: string, tag: string): boolean {

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.contentTags?.includes(tag) || false;
  }

  /**
   * Get all keys with a specific content tag as formatted string.
   */
  getTagged(tag: string): string {
    const entries: Array<[string, any]> = [];

    const keys = this.getSortedKeys();
    keys.forEach(key => {
      if (this.hasTag(key, tag)) {
        entries.push([key, this.get_value(key)]);
      }
    });

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  /**
   * Get array of keys with a specific content tag.
   */
  getKeysByTag(tag: string): string[] {
    const keys = this.getSortedKeys();
    return keys.filter(key => this.hasTag(key, tag));
  }

  // ============================================
  // System Tag Methods (requires system access level)
  // ============================================

  /**
   * Add a system tag to a key (requires system access).
   * System tags: 'SystemPrompt', 'LLMRead', 'LLMWrite', 'readonly', 'protected', 'ApplyTemplate'
   */
  systemAddTag(key: string, tag: SystemTag): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemAddTag requires system access level');
      return false;
    }


    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const systemTags = attributes?.systemTags || [];

    if (systemTags.includes(tag)) {
      return false;
    }

    this.doc.transact(() => {
      const newSystemTags = [...systemTags, tag];
      const normalizedTags = this.normalizeSystemTags(newSystemTags);
      entryMap.set('attributes', {
        ...attributes,
        systemTags: normalizedTags
      });
    });

    this.notifyGlobalListeners();
    return true;
  }

  /**
   * Remove a system tag from a key (requires system access).
   */
  systemRemoveTag(key: string, tag: SystemTag): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemRemoveTag requires system access level');
      return false;
    }


    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const systemTags = attributes?.systemTags || [];
    const tagIndex = systemTags.indexOf(tag);

    if (tagIndex === -1) {
      return false;
    }

    this.doc.transact(() => {
      const newSystemTags = systemTags.filter((t: SystemTag) => t !== tag);
      entryMap.set('attributes', {
        ...attributes,
        systemTags: newSystemTags
      });
    });

    this.notifyGlobalListeners();
    return true;
  }

  /**
   * Get all system tags for a key (requires system access).
   */
  systemGetTags(key: string): SystemTag[] {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemGetTags requires system access level');
      return [];
    }


    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return [];
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.systemTags || [];
  }

  /**
   * Check if a key has a specific system tag (requires system access).
   */
  systemHasTag(key: string, tag: SystemTag): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemHasTag requires system access level');
      return false;
    }


    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.systemTags?.includes(tag) || false;
  }

  /**
   * Set all system tags for a key at once (requires system access).
   */
  systemSetTags(key: string, tags: SystemTag[]): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemSetTags requires system access level');
      return false;
    }


    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    this.doc.transact(() => {
      const attributes = entryMap.get('attributes') as KeyAttributes;
      entryMap.set('attributes', {
        ...attributes,
        systemTags: [...tags]
      });
    });

    this.notifyGlobalListeners();
    return true;
  }

  /**
   * Get all keys with a specific system tag (requires system access).
   */
  systemGetKeysByTag(tag: SystemTag): string[] {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemGetKeysByTag requires system access level');
      return [];
    }

    const keys = this.getSortedKeys();
    return keys.filter(key => this.systemHasTag(key, tag));
  }

  /**
   * Helper to get sorted keys (by zIndex).
   * Respects context filtering when set.
   */
  private getSortedKeys(): string[] {
    const entries: Array<{ key: string; zIndex: number }> = [];

    for (const [key, val] of this.rootMap) {
      if (!this.keyMatchesContext(key)) {
        continue;
      }
      const entryMap = val as Y.Map<any>;
      const attributes = entryMap.get('attributes') as KeyAttributes;
      entries.push({ key, zIndex: attributes?.zIndex ?? 0 });
    }

    return entries
      .sort((a, b) => a.zIndex - b.zIndex)
      .map(e => e.key);
  }

  /**
   * Serialize to JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.serialize());
  }

  /**
   * Deserialize from JSON string.
   */
  fromJSON(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      this.deserialize(data);
    } catch (error) {
      console.error('MindCache: Failed to deserialize JSON:', error);
    }
  }

  /**
   * Export to Markdown format.
   */
  toMarkdown(): string {
    const now = new Date();
    const lines: string[] = [];
    const appendixEntries: Array<{
      key: string;
      type: string;
      contentType: string;
      base64: string;
      label: string;
    }> = [];
    let appendixCounter = 0;

    lines.push('# MindCache STM Export');
    lines.push('');
    lines.push(`Export Date: ${now.toISOString().split('T')[0]}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## STM Entries');
    lines.push('');

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entryMap = this.rootMap.get(key);
      if (!entryMap) {
        return;
      }

      const attributes = entryMap.get('attributes') as KeyAttributes;
      const value = entryMap.get('value');

      if (attributes?.systemTags?.includes('protected')) {
        return;
      }

      lines.push(`### ${key}`);
      const entryType = attributes?.type || 'text';
      lines.push(`- **Type**: \`${entryType}\``);
      lines.push(`- **System Tags**: \`${attributes?.systemTags?.join(', ') || 'none'}\``);
      lines.push(`- **Z-Index**: \`${attributes?.zIndex ?? 0}\``);

      if (attributes?.contentTags && attributes.contentTags.length > 0) {
        lines.push(`- **Tags**: \`${attributes.contentTags.join('`, `')}\``);
      }

      if (attributes?.contentType) {
        lines.push(`- **Content Type**: \`${attributes.contentType}\``);
      }

      if (entryType === 'image' || entryType === 'file') {
        const label = String.fromCharCode(65 + appendixCounter);
        appendixCounter++;
        lines.push(`- **Value**: [See Appendix ${label}]`);

        appendixEntries.push({
          key,
          type: entryType,
          contentType: attributes?.contentType || 'application/octet-stream',
          base64: value as string,
          label
        });
      } else if (entryType === 'json') {
        lines.push('- **Value**:');
        lines.push('```json');
        try {
          const jsonValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          lines.push(jsonValue);
        } catch {
          lines.push(String(value));
        }
        lines.push('```');
      } else {
        // Use code blocks for ALL values to support multi-line content
        lines.push('- **Value**:');
        lines.push('```');
        lines.push(String(value));
        lines.push('```');
      }

      lines.push('');
    });

    // Add appendix for binary data
    if (appendixEntries.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Appendix: Binary Data');
      lines.push('');

      appendixEntries.forEach(entry => {
        lines.push(`### Appendix ${entry.label}: ${entry.key}`);
        lines.push(`- **Type**: \`${entry.type}\``);
        lines.push(`- **Content Type**: \`${entry.contentType}\``);
        lines.push('- **Base64 Data**:');
        lines.push('```');
        lines.push(entry.base64);
        lines.push('```');
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * Import from Markdown format.
   * @param markdown The markdown string to import
   * @param merge If false (default), clears existing data before importing. If true, merges with existing data.
   */
  fromMarkdown(markdown: string, merge: boolean = false): void {
    const lines = markdown.split('\n');
    let currentKey: string | null = null;
    let currentAttributes: Partial<KeyAttributes> = {};
    let currentValue: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    const _appendixData: Record<string, string> = {};

    // Clear existing data unless merging
    if (!merge) {
      this.clear();
    }

    for (const line of lines) {
      // Parse key headers
      if (line.startsWith('### ') && !line.startsWith('### Appendix')) {
        // Save previous entry
        if (currentKey && currentValue !== null) {
          this.set_value(currentKey, currentValue.trim(), currentAttributes);
        }

        currentKey = line.substring(4).trim();
        currentAttributes = {};
        currentValue = null;
        continue;
      }

      // Parse appendix
      if (line.startsWith('### Appendix ')) {
        // Save previous appendix entry
        if (currentKey && currentValue !== null) {
          this.set_value(currentKey, currentValue.trim(), currentAttributes);
        }

        const match = line.match(/### Appendix ([A-Z]): (.+)/);
        if (match) {
          currentKey = match[2];
          currentAttributes = {};
          currentValue = null;
        }
        continue;
      }

      // Parse attributes
      if (line.startsWith('- **Type**:')) {
        const type = line.match(/`(.+)`/)?.[1] as KeyAttributes['type'];
        if (type) {
          currentAttributes.type = type;
        }
        continue;
      }
      if (line.startsWith('- **System Tags**:')) {
        const tagsStr = line.match(/`([^`]+)`/)?.[1] || '';
        if (tagsStr !== 'none') {
          currentAttributes.systemTags = tagsStr.split(', ').filter(t => t) as SystemTag[];
        }
        continue;
      }
      if (line.startsWith('- **Z-Index**:')) {
        const zIndex = parseInt(line.match(/`(\d+)`/)?.[1] || '0', 10);
        currentAttributes.zIndex = zIndex;
        continue;
      }
      if (line.startsWith('- **Tags**:')) {
        const tags = line.match(/`([^`]+)`/g)?.map(t => t.slice(1, -1)) || [];
        currentAttributes.contentTags = tags;
        continue;
      }
      if (line.startsWith('- **Content Type**:')) {
        currentAttributes.contentType = line.match(/`(.+)`/)?.[1];
        continue;
      }
      // Handle Base64 Data from appendix
      if (line.startsWith('- **Base64 Data**:')) {
        // Expect code block on next line
        currentValue = '';
        continue;
      }
      // Handle Value lines - including appendix references
      if (line.startsWith('- **Value**:')) {
        const afterValue = line.substring(12).trim();

        if (afterValue.includes('[See Appendix')) {
          // This is an appendix reference - save the entry now with placeholder
          // The value will be updated when we parse the appendix
          if (currentKey) {
            this.set_value(currentKey, '', currentAttributes);
          }
          currentValue = null; // Reset so we don't overwrite later
          continue;
        }

        if (afterValue === '') {
          // Empty - expect code block on next line
          currentValue = '';
        } else if (afterValue === '```' || afterValue === '```json') {
          // Code block starts on this line, content on next
          inCodeBlock = true;
          codeBlockContent = [];
          currentValue = '';
        } else if (afterValue.startsWith('```')) {
          // Code block with content on same line: ```mindmap or ```some text
          inCodeBlock = true;
          codeBlockContent = [afterValue.substring(3)]; // Capture content after ```
          currentValue = '';
        } else {
          // Inline value (legacy format)
          currentValue = afterValue;
        }
        continue;
      }

      // Handle code blocks - check trimmed line for robustness
      const trimmedLine = line.trim();
      if (trimmedLine === '```json' || trimmedLine === '```') {
        if (inCodeBlock) {
          // End of code block
          inCodeBlock = false;
          if (currentKey && codeBlockContent.length > 0) {
            currentValue = codeBlockContent.join('\n');
          }
          codeBlockContent = [];
        } else {
          inCodeBlock = true;
          codeBlockContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
      } else if (currentKey && currentValue !== null) {
        // Stop appending when we hit section markers
        if (line.trim() === '---' || line.startsWith('## Appendix')) {
          // Save the current entry and reset
          this.set_value(currentKey, currentValue.trim(), currentAttributes);
          currentKey = null;
          currentValue = null;
          currentAttributes = {};
        } else {
          currentValue += '\n' + line;
        }
      }
    }

    // Save last entry
    if (currentKey && currentValue !== null) {
      this.set_value(currentKey, currentValue.trim(), currentAttributes);
    }

    // If no keys were parsed but we have content, treat as unstructured text
    // But skip if this is an STM export format (which might just be empty)

    // Check if we parsed any keys
    const hasParsedKeys = lines.some(line => line.startsWith('### ') && !line.startsWith('### Appendix'));
    const isSTMExport = markdown.includes('# MindCache STM Export') || markdown.includes('## STM Entries');

    if (!hasParsedKeys && !isSTMExport && markdown.trim().length > 0) {
      this.set_value('imported_content', markdown.trim(), {
        type: 'text',
        systemTags: ['SystemPrompt', 'LLMWrite'], // Default assumptions
        zIndex: 0
      });
    }
  }

  /**
   * Set base64 binary data.
   */
  set_base64(key: string, base64Data: string, contentType: string, type: 'image' | 'file' = 'file', attributes?: Partial<KeyAttributes>): void {
    if (!this.validateContentType(type, contentType)) {
      throw new Error(`Invalid content type ${contentType} for type ${type}`);
    }

    const fileAttributes: Partial<KeyAttributes> = {
      type,
      contentType,
      ...attributes
    };

    this.set_value(key, base64Data, fileAttributes);
  }

  /**
   * Add an image from base64 data.
   */
  add_image(key: string, base64Data: string, contentType: string = 'image/jpeg', attributes?: Partial<KeyAttributes>): void {
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid image content type: ${contentType}. Must start with 'image/'`);
    }

    this.set_base64(key, base64Data, contentType, 'image', attributes);
  }

  /**
   * Get the data URL for an image or file key.
   */
  get_data_url(key: string): string | undefined {
    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return undefined;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    if (attributes?.type !== 'image' && attributes?.type !== 'file') {
      return undefined;
    }

    if (!attributes?.contentType) {
      return undefined;
    }

    const value = entryMap.get('value') as string;
    return this.createDataUrl(value, attributes.contentType);
  }

  /**
   * Get the base64 data for an image or file key.
   */
  get_base64(key: string): string | undefined {
    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return undefined;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    if (attributes?.type !== 'image' && attributes?.type !== 'file') {
      return undefined;
    }

    return entryMap.get('value') as string;
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

  // Document methods for collaborative editing

  /**
   * Create or get a collaborative document key.
   * Uses Y.Text for character-level concurrent editing.
   *
   * Note: This exposes Yjs Y.Text directly for editor bindings (y-quill, y-codemirror, etc.)
   */
  set_document(key: string, initialText?: string, attributes?: Partial<KeyAttributes>): void {

    let entryMap = this.rootMap.get(key);

    if (!entryMap) {
      entryMap = new Y.Map();
      this.rootMap.set(key, entryMap);

      // Create Y.Text for collaborative editing
      const yText = new Y.Text(initialText || '');
      entryMap.set('value', yText);
      entryMap.set('attributes', {
        ...DEFAULT_KEY_ATTRIBUTES,
        type: 'document',
        contentTags: [],
        systemTags: ['SystemPrompt', 'LLMWrite'],
        tags: [],
        zIndex: 0,
        ...attributes
      });
    }

    // Ensure UndoManager for this key
    this.getUndoManager(key);
  }

  /**
   * Get the Y.Text object for a document key.
   * Use this to bind to editors (Quill, CodeMirror, Monaco, etc.)
   *
   * @returns Y.Text or undefined if key doesn't exist or isn't a document
   */
  get_document(key: string): Y.Text | undefined {
    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return undefined;
    }

    const attrs = entryMap.get('attributes') as KeyAttributes;
    if (attrs?.type !== 'document') {
      return undefined;
    }

    const value = entryMap.get('value');
    if (value instanceof Y.Text) {
      return value;
    }

    return undefined;
  }



  /**
   * Insert text at a position in a document key.
   */
  insert_text(key: string, index: number, text: string): void {
    const yText = this.get_document(key);
    if (yText) {
      yText.insert(index, text);
    }
  }

  /**
   * Delete text from a document key.
   */
  delete_text(key: string, index: number, length: number): void {
    const yText = this.get_document(key);
    if (yText) {
      yText.delete(index, length);
    }
  }

  /**
   * Replace all text in a document key (private - use set_value for public API).
   * Uses diff-based updates when changes are < diffThreshold (default 80%).
   * This preserves concurrent edits and provides better undo granularity.
   */
  private _replaceDocumentText(key: string, newText: string, diffThreshold = 0.8): void {
    const yText = this.get_document(key);
    if (!yText) {
      return;
    }

    const oldText = yText.toString();

    // If same content, do nothing
    if (oldText === newText) {
      return;
    }

    // If empty, just insert
    if (oldText.length === 0) {
      yText.insert(0, newText);
      return;
    }

    // Compute diff
    const diffs = diff(oldText, newText);

    // Calculate change ratio
    let changedChars = 0;
    for (const [op, text] of diffs) {
      if (op !== 0) {
        changedChars += text.length;
      }
    }
    const changeRatio = changedChars / Math.max(oldText.length, newText.length);

    // If too many changes, do full replace (more efficient)
    if (changeRatio > diffThreshold) {
      this.doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, newText);
      });
      return;
    }

    // Apply incremental diff operations
    this.doc.transact(() => {
      let cursor = 0;
      for (const [op, text] of diffs) {
        if (op === 0) {
          // Equal - move cursor
          cursor += text.length;
        } else if (op === -1) {
          // Delete
          yText.delete(cursor, text.length);
        } else if (op === 1) {
          // Insert
          yText.insert(cursor, text);
          cursor += text.length;
        }
      }
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

  // Sanitize key name for use in tool names
  private sanitizeKeyForTool(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // Find original key from sanitized tool name
  private findKeyFromSanitizedTool(sanitizedKey: string): string | undefined {
    for (const [key] of this.rootMap) {
      if (this.sanitizeKeyForTool(key) === sanitizedKey) {
        return key;
      }
    }
    return undefined;
  }

  /**
   * Generate Vercel AI SDK compatible tools for writable keys.
   * For document type keys, generates additional tools: append_, insert_, edit_
   *
   * Security: All tools use llm_set_key internally which:
   * - Only modifies VALUES, never attributes/systemTags
   * - Prevents LLMs from escalating privileges
   */
  create_vercel_ai_tools(): Record<string, any> {
    const tools: Record<string, any> = {};

    for (const [key, val] of this.rootMap) {
      // Skip system keys
      if (key.startsWith('$')) {
        continue;
      }

      // Skip keys that don't match context
      if (!this.keyMatchesContext(key)) {
        continue;
      }

      const entryMap = val as Y.Map<any>;
      const attributes = entryMap.get('attributes') as KeyAttributes;

      // Check if key has LLMWrite access (writable by LLM)
      const isWritable = attributes?.systemTags?.includes('LLMWrite');

      if (!isWritable) {
        continue;
      }

      const sanitizedKey = this.sanitizeKeyForTool(key);
      const isDocument = attributes?.type === 'document';

      // 1. write_ tool (for all writable keys)
      tools[`write_${sanitizedKey}`] = {
        description: isDocument
          ? `Rewrite the entire "${key}" document`
          : `Write a value to the STM key: ${key}`,
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'string', description: isDocument ? 'New document content' : 'The value to write' }
          },
          required: ['value']
        },
        execute: async ({ value }: { value: any }) => {
          // Use llm_set_key for security - only modifies value, not attributes
          const success = this.llm_set_key(key, value);
          if (success) {
            return {
              result: `Successfully wrote "${value}" to ${key}`,
              key,
              value
            };
          }
          return {
            result: `Failed to write to ${key} - permission denied or key not found`,
            key,
            error: true
          };
        }
      };

      // For document type, add additional tools
      if (isDocument) {
        // 2. append_ tool
        tools[`append_${sanitizedKey}`] = {
          description: `Append text to the end of "${key}" document`,
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to append' }
            },
            required: ['text']
          },
          execute: async ({ text }: { text: string }) => {
            // Check permission first
            if (!attributes?.systemTags?.includes('LLMWrite')) {
              return { result: `Permission denied for ${key}`, key, error: true };
            }
            const yText = this.get_document(key);
            if (yText) {
              yText.insert(yText.length, text);
              return {
                result: `Successfully appended to ${key}`,
                key,
                appended: text
              };
            }
            return { result: `Document ${key} not found`, key };
          }
        };

        // 3. insert_ tool
        tools[`insert_${sanitizedKey}`] = {
          description: `Insert text at a position in "${key}" document`,
          inputSchema: {
            type: 'object',
            properties: {
              index: { type: 'number', description: 'Position to insert at (0 = start)' },
              text: { type: 'string', description: 'Text to insert' }
            },
            required: ['index', 'text']
          },
          execute: async ({ index, text }: { index: number; text: string }) => {
            // Check permission first
            if (!attributes?.systemTags?.includes('LLMWrite')) {
              return { result: `Permission denied for ${key}`, key, error: true };
            }
            this.insert_text(key, index, text);
            return {
              result: `Successfully inserted text at position ${index} in ${key}`,
              key,
              index,
              inserted: text
            };
          }
        };

        // 4. edit_ tool (find and replace)
        tools[`edit_${sanitizedKey}`] = {
          description: `Find and replace text in "${key}" document`,
          inputSchema: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Text to find' },
              replace: { type: 'string', description: 'Replacement text' }
            },
            required: ['find', 'replace']
          },
          execute: async ({ find, replace }: { find: string; replace: string }) => {
            // Check permission first
            if (!attributes?.systemTags?.includes('LLMWrite')) {
              return { result: `Permission denied for ${key}`, key, error: true };
            }
            const yText = this.get_document(key);
            if (yText) {
              const text = yText.toString();
              const idx = text.indexOf(find);
              if (idx !== -1) {
                yText.delete(idx, find.length);
                yText.insert(idx, replace);
                return {
                  result: `Successfully replaced "${find}" with "${replace}" in ${key}`,
                  key,
                  find,
                  replace,
                  index: idx
                };
              }
              return { result: `Text "${find}" not found in ${key}`, key };
            }
            return { result: `Document ${key} not found`, key };
          }
        };
      }
    }

    return tools;
  }

  /**
   * @deprecated Use create_vercel_ai_tools() instead
   */
  get_aisdk_tools(): Record<string, any> {
    return this.create_vercel_ai_tools();
  }

  /**
   * Generate a system prompt containing all visible STM keys and their values.
   * Indicates which tools can be used to modify writable keys.
   */
  get_system_prompt(): string {
    const lines: string[] = [];

    for (const [key, val] of this.rootMap) {
      // Skip system keys for now, add them at the end
      if (key.startsWith('$')) {
        continue;
      }

      // Skip keys that don't match context
      if (!this.keyMatchesContext(key)) {
        continue;
      }

      const entryMap = val as Y.Map<any>;
      const attributes = entryMap.get('attributes') as KeyAttributes;

      // Check visibility - key is visible if it has SystemPrompt or LLMRead tag
      const isVisible = attributes?.systemTags?.includes('SystemPrompt') ||
        attributes?.systemTags?.includes('LLMRead');

      if (!isVisible) {
        continue;
      }

      const value = this.get_value(key);
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;

      // Check if writable - key is writable if it has LLMWrite tag
      const isWritable = attributes?.systemTags?.includes('LLMWrite');

      const isDocument = attributes?.type === 'document';
      const sanitizedKey = this.sanitizeKeyForTool(key);

      if (isWritable) {
        if (isDocument) {
          lines.push(
            `${key}: ${displayValue}. ` +
            `Document tools: write_${sanitizedKey}, append_${sanitizedKey}, edit_${sanitizedKey}`
          );
        } else {
          const oldValueHint = displayValue
            ? ' This tool DOES NOT append — start your response ' +
            `with the old value (${displayValue})`
            : '';
          lines.push(
            `${key}: ${displayValue}. ` +
            `You can rewrite "${key}" by using the write_${sanitizedKey} tool.${oldValueHint}`
          );
        }
      } else {
        lines.push(`${key}: ${displayValue}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Execute a tool call by name with the given value.
   * Returns the result or null if tool not found.
   */
  executeToolCall(
    toolName: string,
    value: any
  ): { result: string; key: string; value?: any } | null {
    // Parse tool name (format: action_keyname)
    const match = toolName.match(/^(write|append|insert|edit)_(.+)$/);
    if (!match) {
      return null;
    }

    const [, action, sanitizedKey] = match;
    const key = this.findKeyFromSanitizedTool(sanitizedKey);

    if (!key) {
      return null;
    }

    const entryMap = this.rootMap.get(key);
    if (!entryMap) {
      return null;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;

    // Check if writable - key is writable if it has LLMWrite tag
    const isWritable = attributes?.systemTags?.includes('LLMWrite');

    if (!isWritable) {
      return null;
    }

    const isDocument = attributes?.type === 'document';

    switch (action) {
      case 'write':
        if (isDocument) {
          this._replaceDocumentText(key, value);
        } else {
          this.set_value(key, value);
        }
        return {
          result: `Successfully wrote "${value}" to ${key}`,
          key,
          value
        };

      case 'append':
        if (isDocument) {
          const yText = this.get_document(key);
          if (yText) {
            yText.insert(yText.length, value);
            return {
              result: `Successfully appended to ${key}`,
              key,
              value
            };
          }
        }
        return null;

      case 'insert':
        if (isDocument && typeof value === 'object' && value.index !== undefined && value.text) {
          this.insert_text(key, value.index, value.text);
          return {
            result: `Successfully inserted at position ${value.index} in ${key}`,
            key,
            value: value.text
          };
        }
        return null;

      case 'edit':
        if (isDocument && typeof value === 'object' && value.find && value.replace !== undefined) {
          const yText = this.get_document(key);
          if (yText) {
            const text = yText.toString();
            const idx = text.indexOf(value.find);
            if (idx !== -1) {
              yText.delete(idx, value.find.length);
              yText.insert(idx, value.replace);
              return {
                result: `Successfully replaced "${value.find}" with "${value.replace}" in ${key}`,
                key,
                value: value.replace
              };
            }
          }
        }
        return null;

      default:
        return null;
    }
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
