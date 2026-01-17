/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import diff from 'fast-diff';
import type { KeyAttributes, STM, Listener, GlobalListener, AccessLevel, SystemTag, HistoryEntry, HistoryOptions, ContextRules, CustomTypeDefinition } from './types';
import { DEFAULT_KEY_ATTRIBUTES } from './types';

// Re-export SystemTag for convenience
export type { SystemTag } from './types';
import { SchemaParser } from './SchemaParser';
import { MarkdownSerializer } from './MarkdownSerializer';
import { AIToolBuilder } from './AIToolBuilder';
import { TagManager } from './TagManager';

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
  /** Instance ID to connect to (not needed for OAuth - auto-provisioned) */
  instanceId?: string;
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
  /**
   * OAuth configuration for browser apps using "Sign in with MindCache"
   * When set, user authentication and instance provisioning is automatic
   */
  oauth?: {
    /** Client ID from MindCache developer portal */
    clientId: string;
    /** Redirect URI for OAuth callback (defaults to current URL) */
    redirectUri?: string;
    /** Scopes to request (default: ['read', 'write']) */
    scopes?: string[];
    /** Auto-redirect to login if not authenticated (default: false) */
    autoLogin?: boolean;
  };
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
  public rootMap: Y.Map<Y.Map<any>>; // Key -> EntryMap({value, attributes})

  // Cache listeners
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: GlobalListener[] = [];

  // Metadata
  public readonly version = '3.6.0';

  // Internal flag to prevent sync loops when receiving remote updates
  // (Less critical with Yjs but kept for API compat)


  normalizeSystemTags(tags: SystemTag[]): SystemTag[] {
    const normalized: SystemTag[] = [];
    const seen = new Set<SystemTag>();

    for (const tag of tags) {
      // Only include valid SystemTag values, skip duplicates
      if (['SystemPrompt', 'LLMRead', 'LLMWrite', 'ApplyTemplate'].includes(tag)) {
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

  // Custom type registry
  private _typeRegistry: Map<string, CustomTypeDefinition> = new Map();

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
  keyMatchesContext(key: string): boolean {
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
    return TagManager.addTag(this, key, tag);
  }

  /**
   * Remove a content tag from a key.
   * @returns true if the tag was removed
   */
  removeTag(key: string, tag: string): boolean {
    return TagManager.removeTag(this, key, tag);
  }

  /**
   * Get all content tags for a key.
   */
  getTags(key: string): string[] {
    return TagManager.getTags(this, key);
  }

  /**
   * Get all unique content tags across all keys.
   */
  getAllTags(): string[] {
    return TagManager.getAllTags(this);
  }

  /**
   * Check if a key has a specific content tag.
   */
  hasTag(key: string, tag: string): boolean {
    return TagManager.hasTag(this, key, tag);
  }

  /**
   * Get all keys with a specific content tag as formatted string.
   */
  getTagged(tag: string): string {
    return TagManager.getTagged(this, tag);
  }

  /**
   * Get array of keys with a specific content tag.
   */
  getKeysByTag(tag: string): string[] {
    return TagManager.getKeysByTag(this, tag);
  }

  // ============================================
  // System Tag Methods (requires system access level)
  // ============================================

  /**
   * Add a system tag to a key (requires system access).
   * System tags: 'SystemPrompt', 'LLMRead', 'LLMWrite', 'ApplyTemplate'
   */
  systemAddTag(key: string, tag: SystemTag): boolean {
    return TagManager.systemAddTag(this, key, tag);
  }

  /**
   * Remove a system tag from a key (requires system access).
   */
  systemRemoveTag(key: string, tag: SystemTag): boolean {
    return TagManager.systemRemoveTag(this, key, tag);
  }

  /**
   * Get all system tags for a key (requires system access).
   */
  systemGetTags(key: string): SystemTag[] {
    return TagManager.systemGetTags(this, key);
  }

  /**
   * Check if a key has a specific system tag (requires system access).
   */
  systemHasTag(key: string, tag: SystemTag): boolean {
    return TagManager.systemHasTag(this, key, tag);
  }

  /**
   * Set all system tags for a key at once (requires system access).
   */
  systemSetTags(key: string, tags: SystemTag[]): boolean {
    return TagManager.systemSetTags(this, key, tags);
  }

  /**
   * Get all keys with a specific system tag (requires system access).
   */
  systemGetKeysByTag(tag: SystemTag): string[] {
    return TagManager.systemGetKeysByTag(this, tag);
  }

  // ============================================
  // Custom Type Methods
  // ============================================

  /**
   * Register a custom type with a markdown schema definition.
   *
   * Schema format:
   * ```
   * #TypeName
   * * fieldName: description of the field
   * * anotherField: description
   * ```
   *
   * @param name - Type name (e.g., 'Contact')
   * @param schema - Markdown schema definition
   * @throws Error if schema format is invalid
   */
  registerType(name: string, schema: string): void {
    const typeDef = SchemaParser.parse(schema);
    // Override name if different from schema header
    typeDef.name = name;
    this._typeRegistry.set(name, typeDef);
  }

  /**
   * Assign a custom type to a key.
   * The key must exist and the type must be registered.
   * Also sets the underlying type to 'json' since custom types are structured JSON data.
   *
   * @param key - Key to assign type to
   * @param typeName - Registered type name
   * @throws Error if key doesn't exist or type is not registered
   */
  setType(key: string, typeName: string): void {
    if (!this.rootMap.has(key)) {
      throw new Error(`Key "${key}" does not exist`);
    }
    if (!this._typeRegistry.has(typeName)) {
      throw new Error(`Type "${typeName}" is not registered. Use registerType() first.`);
    }
    // Custom types are JSON data, so set both type and customType
    this.set_attributes(key, { type: 'json', customType: typeName });
  }

  /**
   * Get a registered type schema definition.
   *
   * @param typeName - Type name to look up
   * @returns The type definition or undefined if not registered
   */
  getTypeSchema(typeName: string): CustomTypeDefinition | undefined {
    return this._typeRegistry.get(typeName);
  }

  /**
   * Get all registered type names.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this._typeRegistry.keys());
  }

  /**
   * Get the custom type assigned to a key.
   *
   * @param key - Key to check
   * @returns Type name or undefined if no custom type assigned
   */
  getKeyType(key: string): string | undefined {
    const attrs = this.get_attributes(key);
    return attrs?.customType;
  }

  /**
   * Helper to get sorted keys (by zIndex).
   * Respects context filtering when set.
   */
  getSortedKeys(): string[] {
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
    return MarkdownSerializer.toMarkdown(this);
  }

  /**
   * Import from Markdown format.
   * @param markdown The markdown string to import
   * @param merge If false (default), clears existing data before importing. If true, merges with existing data.
   */
  fromMarkdown(markdown: string, merge: boolean = false): void {
    MarkdownSerializer.fromMarkdown(markdown, this, merge);
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
   * Replace all text in a document key.
   * Uses diff-based updates when changes are < diffThreshold (default 80%).
   * This preserves concurrent edits and provides better undo granularity.
   */
  _replaceDocumentText(key: string, newText: string, diffThreshold = 0.8): void {
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

  notifyGlobalListeners(): void {
    this.globalListeners.forEach(l => l());
  }

  // Sanitize key name for use in tool names
  sanitizeKeyForTool(key: string): string {
    return AIToolBuilder.sanitizeKeyForTool(key);
  }

  // Find original key from sanitized tool name
  findKeyFromSanitizedTool(sanitizedKey: string): string | undefined {
    return AIToolBuilder.findKeyFromSanitizedTool(this, sanitizedKey);
  }

  /**
   * Generate framework-agnostic tools with raw JSON Schema.
   * Works with: OpenAI SDK, Anthropic SDK, LangChain, and other frameworks.
   *
   * Tool format:
   * {
   *   description: string,
   *   parameters: { type: 'object', properties: {...}, required: [...] },
   *   execute: async (args) => result
   * }
   *
   * Security: All tools use llm_set_key internally which:
   * - Only modifies VALUES, never attributes/systemTags
   * - Prevents LLMs from escalating privileges
   */
  create_tools(): Record<string, any> {
    return AIToolBuilder.createTools(this);
  }

  /**
   * Generate Vercel AI SDK compatible tools for writable keys.
   * Wraps parameters with jsonSchema() for AI SDK v5 compatibility.
   * Use this with: generateText(), streamText() from 'ai' package.
   *
   * Security: All tools use llm_set_key internally which:
   * - Only modifies VALUES, never attributes/systemTags
   * - Prevents LLMs from escalating privileges
   */
  create_vercel_ai_tools(): Record<string, any> {
    return AIToolBuilder.createVercelAITools(this);
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
    return AIToolBuilder.getSystemPrompt(this);
  }

  /**
   * Execute a tool call by name with the given value.
   * Returns the result or null if tool not found.
   */
  executeToolCall(
    toolName: string,
    value: any
  ): { result: string; key: string; value?: any } | null {
    return AIToolBuilder.executeToolCall(this, toolName, value);
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
