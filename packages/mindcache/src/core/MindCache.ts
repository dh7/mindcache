/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import type { KeyAttributes, STM, STMEntry, Listener, GlobalListener, AccessLevel, SystemTag } from './types';
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
  private stm: STM = {};
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: GlobalListener[] = [];

  // Internal flag to prevent sync loops when receiving remote updates
  private _isRemoteUpdate = false;

  /**
   * Normalize system tags: migrate old tags to new ones
   * - 'prompt' → 'SystemPrompt'
   * - 'readonly' → remove 'LLMWrite' (or add if not readonly)
   */
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

    // LLMWrite logic: if readonly exists, NO LLMWrite; otherwise, add LLMWrite
    // But if LLMWrite already exists, keep it (unless readonly also exists)
    if (hasReadonly) {
      // Keep readonly tag for backward compatibility with web package
      normalized.push('readonly');
      // Don't add LLMWrite (readonly = not writable)
    } else if (hasLLMWrite) {
      normalized.push('LLMWrite');
    } else {
      // Default: if neither readonly nor LLMWrite specified, default to LLMWrite (writable)
      normalized.push('LLMWrite');
    }

    return normalized;
  }

  /**
   * Check if key should be visible in system prompt
   */
  private hasSystemPrompt(tags: SystemTag[]): boolean {
    return tags.includes('SystemPrompt') || tags.includes('prompt');
  }

  /**
   * Check if key can be read by LLM (has LLMRead or SystemPrompt)
   */
  private hasLLMRead(tags: SystemTag[]): boolean {
    return tags.includes('LLMRead') || tags.includes('SystemPrompt') || tags.includes('prompt');
  }

  /**
   * Check if key can be written by LLM (has LLMWrite and not readonly)
   */
  private hasLLMWrite(tags: SystemTag[]): boolean {
    return tags.includes('LLMWrite') && !tags.includes('readonly');
  }

  // Cloud sync state
  private _cloudAdapter: ICloudAdapter | null = null;
  private _connectionState: ConnectionState = 'disconnected';
  private _isLoaded = true; // Default true for local mode
  private _cloudConfig: MindCacheCloudOptions | null = null;

  // Access level for system operations
  private _accessLevel: AccessLevel = 'user';

  private _initPromise: Promise<void> | null = null;

  constructor(options?: MindCacheOptions) {
    if (options?.accessLevel) {
      this._accessLevel = options.accessLevel;
    }

    // Cloud and IndexedDB are mutually exclusive to avoid data conflicts
    if (options?.cloud && options?.indexedDB) {
      throw new Error(
        'MindCache: Cannot use both cloud and indexedDB together. ' +
        'Choose one persistence method to avoid data conflicts. ' +
        'Use cloud for real-time sync, or indexedDB for local-only persistence.'
      );
    }

    const initPromises: Promise<void>[] = [];

    if (options?.cloud) {
      this._cloudConfig = options.cloud;
      this._isLoaded = false; // Wait for sync
      this._connectionState = 'disconnected';
      initPromises.push(this._initCloud());
    }

    if (options?.indexedDB) {
      // IndexedDB is async, so we wait for it
      this._isLoaded = false;
      initPromises.push(this._initIndexedDB(options.indexedDB));
    }

    if (initPromises.length > 0) {
      this._initPromise = Promise.all(initPromises).then(() => {
        // If we are strictly local (no cloud), we are loaded when init finishes
        if (!this._cloudConfig) {
          this._isLoaded = true;
        }
      });
    }
  }



  /**
   * Get the current access level
   */
  get accessLevel(): AccessLevel {
    return this._accessLevel;
  }

  /**
   * Check if this instance has system-level access
   */
  get hasSystemAccess(): boolean {
    return this._accessLevel === 'system';
  }

  private async _initCloud(): Promise<void> {
    if (!this._cloudConfig) {
      return;
    }

    try {

      // Load adapter class (extracted for testing)
      const CloudAdapter = await this._getCloudAdapterClass();

      // Require baseUrl for cloud mode
      if (!this._cloudConfig.baseUrl) {
        throw new Error('MindCache Cloud: baseUrl is required. Please provide the cloud API URL in your configuration.');
      }

      // Convert HTTP URL to WebSocket URL
      const baseUrl = this._cloudConfig.baseUrl
        .replace('https://', 'wss://')
        .replace('http://', 'ws://');

      const adapter = new CloudAdapter({
        instanceId: this._cloudConfig.instanceId,
        projectId: this._cloudConfig.projectId || 'default',
        baseUrl,
        apiKey: this._cloudConfig.apiKey
      });

      // Set up token provider if tokenEndpoint is provided
      if (this._cloudConfig.tokenEndpoint) {
        const tokenEndpoint = this._cloudConfig.tokenEndpoint;
        const instanceId = this._cloudConfig.instanceId;

        // Capture origin at setup time (when window is available) for use during reconnects
        let resolvedBaseUrl: string;
        if (tokenEndpoint.startsWith('http://') || tokenEndpoint.startsWith('https://')) {
          resolvedBaseUrl = tokenEndpoint;
        } else if (typeof window !== 'undefined' && window.location?.origin) {
          resolvedBaseUrl = `${window.location.origin}${tokenEndpoint.startsWith('/') ? '' : '/'}${tokenEndpoint}`;
        } else {
          // This shouldn't happen in normal browser usage, but fail gracefully
          console.warn('MindCache: Cannot resolve tokenEndpoint to absolute URL - window.location not available');
          resolvedBaseUrl = tokenEndpoint;
        }

        adapter.setTokenProvider(async () => {
          const url = resolvedBaseUrl.includes('?')
            ? `${resolvedBaseUrl}&instanceId=${instanceId}`
            : `${resolvedBaseUrl}?instanceId=${instanceId}`;

          const response = await fetch(url);
          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Failed to get token' }));
            throw new Error(error.error || 'Failed to get token');
          }

          const data = await response.json();
          return data.token;
        });
      }

      // Set up event handlers
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

      // Attach and connect
      adapter.attach(this);
      this._cloudAdapter = adapter;
      this._connectionState = 'connecting';

      adapter.connect();
    } catch (error) {
      console.error('MindCache: Failed to initialize cloud connection:', error);
      this._connectionState = 'error';
      this._isLoaded = true; // Allow usage even if cloud fails
    }
  }

  private async _initIndexedDB(config: MindCacheIndexedDBOptions): Promise<void> {
    try {
      const IndexedDBAdapter = await this._getIndexedDBAdapterClass();
      const adapter = new IndexedDBAdapter(config);
      await adapter.attach(this);
    } catch (error) {
      console.error('MindCache: Failed to initialize IndexedDB:', error);
    }
  }

  protected async _getIndexedDBAdapterClass(): Promise<any> {
    const { IndexedDBAdapter } = await import('../local/IndexedDBAdapter');
    return IndexedDBAdapter;
  }

  /**
   * Get the current cloud connection state
   */
  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /**
   * Check if data is loaded (true for local, true after sync for cloud)
   */
  get isLoaded(): boolean {
    return this._isLoaded;
  }

  /**
   * Protected method to load CloudAdapter class.
   * Can be overridden/mocked for testing.
   */
  protected async _getCloudAdapterClass(): Promise<any> {
    const { CloudAdapter } = await import('../cloud/CloudAdapter');
    return CloudAdapter;
  }

  /**
   * Check if this instance is connected to cloud
   */
  get isCloud(): boolean {
    return this._cloudConfig !== null;
  }

  /**
   * Wait for initial sync to complete (or resolve immediately if already synced/local).
   * Useful for scripts or linear execution flows.
   */

  async waitForSync(): Promise<void> {

    if (this._isLoaded) {
      return;
    }

    // If initialization is in progress, wait for it first
    if (this._initPromise) {
      await this._initPromise;
    }

    // Check again after initialization
    if (this._isLoaded) {
      return;
    }

    return new Promise<void>((resolve) => {
      // If we are here, we must have a cloud adapter (otherwise isLoaded would be true)
      // but double check to be safe
      if (!this._cloudAdapter) {
        resolve();
        return;
      }

      const handler = () => {
        this._cloudAdapter?.off('synced', handler);
        resolve();
      };

      this._cloudAdapter.on('synced', handler);
    });
  }

  /**
   * Disconnect from cloud (if connected)
   */
  disconnect(): void {
    if (this._cloudAdapter) {
      this._cloudAdapter.disconnect();
      this._cloudAdapter.detach();
      this._cloudAdapter = null;
      this._connectionState = 'disconnected';
    }
  }

  // Helper method to encode file to base64
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

  // Helper method to create data URL from base64 and content type
  private createDataUrl(base64Data: string, contentType: string): string {
    return `data:${contentType};base64,${base64Data}`;
  }

  // Helper method to validate content type for different STM types
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

  /** @deprecated Use get_value instead */
  get(key: string): any {
    return this.get_value(key);
  }

  // Get a value from the STM with template processing if enabled
  get_value(key: string, _processingStack?: Set<string>): any {
    if (key === '$date') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    if (key === '$time') {
      const now = new Date();
      return now.toTimeString().split(' ')[0];
    }

    const entry = this.stm[key];
    if (!entry) {
      return undefined;
    }

    if (entry.attributes.systemTags?.includes('ApplyTemplate') || entry.attributes.systemTags?.includes('template') || entry.attributes.template) {
      const processingStack = _processingStack || new Set<string>();
      if (processingStack.has(key)) {
        return entry.value;
      }
      processingStack.add(key);
      const result = this.injectSTM(entry.value as string, processingStack);
      processingStack.delete(key);
      return result;
    }

    return entry.value;
  }

  // Get attributes for a key
  get_attributes(key: string): KeyAttributes | undefined {
    if (key === '$date' || key === '$time') {
      return {
        type: 'text',
        contentTags: [],
        systemTags: ['prompt', 'readonly', 'protected'],
        zIndex: 999999, // System keys appear last
        // Legacy attributes
        readonly: true,
        visible: true,
        hardcoded: true,
        template: false,
        tags: []
      };
    }

    const entry = this.stm[key];
    return entry ? entry.attributes : undefined;
  }

  // Set a value in the STM with default attributes
  set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void {
    if (key === '$date' || key === '$time') {
      return;
    }

    const existingEntry = this.stm[key];
    // Preserve hardcoded status - if entry is hardcoded, it must remain hardcoded
    const wasHardcoded = existingEntry?.attributes.hardcoded || existingEntry?.attributes.systemTags?.includes('protected');

    // Deep copy arrays to avoid shared references
    const baseAttributes: KeyAttributes = existingEntry
      ? {
        ...existingEntry.attributes,
        contentTags: [...(existingEntry.attributes.contentTags || [])],
        systemTags: [...(existingEntry.attributes.systemTags || [])] as SystemTag[],
        tags: [...(existingEntry.attributes.tags || [])],
        zIndex: existingEntry.attributes.zIndex ?? 0
      }
      : {
        ...DEFAULT_KEY_ATTRIBUTES,
        contentTags: [],  // Fresh array
        systemTags: ['SystemPrompt', 'LLMWrite'] as SystemTag[],  // Fresh array with default
        tags: [],  // Fresh array
        zIndex: 0
      };

    const finalAttributes = attributes ? { ...baseAttributes, ...attributes } : baseAttributes;

    // Normalize system tags first (migrate old tags to new ones)
    let systemTags = this.normalizeSystemTags(finalAttributes.systemTags || []);

    // If legacy boolean attributes were explicitly provided, sync them TO systemTags
    if (attributes) {
      // Handle readonly → LLMWrite mapping
      if ('readonly' in attributes) {
        if (attributes.readonly) {
          // readonly=true means remove LLMWrite and add readonly tag (for backward compat)
          systemTags = systemTags.filter(t => t !== 'LLMWrite') as SystemTag[];
          if (!systemTags.includes('readonly')) {
            systemTags.push('readonly');
          }
        } else if (!wasHardcoded) {
          // readonly=false means add LLMWrite and remove readonly tag
          if (!systemTags.includes('LLMWrite')) {
            systemTags.push('LLMWrite');
          }
          systemTags = systemTags.filter(t => t !== 'readonly') as SystemTag[];
        }
      }

      // Handle visible → SystemPrompt mapping
      if ('visible' in attributes) {
        if (attributes.visible) {
          if (!systemTags.includes('SystemPrompt')) {
            systemTags.push('SystemPrompt');
          }
          // Remove old 'prompt' tag if present
          systemTags = systemTags.filter(t => t !== 'prompt') as SystemTag[];
        } else {
          systemTags = systemTags.filter(t => t !== 'SystemPrompt' && t !== 'prompt') as SystemTag[];
        }
      }

      // Handle systemTags array directly (new API)
      if ('systemTags' in attributes && Array.isArray(attributes.systemTags)) {
        systemTags = this.normalizeSystemTags(attributes.systemTags);
      }
      if ('hardcoded' in attributes) {
        if (attributes.hardcoded && !systemTags.includes('protected')) {
          systemTags.push('protected');
        } else if (!attributes.hardcoded && !wasHardcoded) {
          // Can't remove protected if entry was already hardcoded
          systemTags = systemTags.filter(t => t !== 'protected') as SystemTag[];
        }
        // If wasHardcoded, always keep protected
        if (wasHardcoded && !systemTags.includes('protected')) {
          systemTags.push('protected');
        }
      } else if (wasHardcoded) {
        // If no hardcoded attribute provided but entry was hardcoded, preserve it
        if (!systemTags.includes('protected')) {
          systemTags.push('protected');
        }
      }
      if ('template' in attributes) {
        if (attributes.template && !wasHardcoded && !systemTags.includes('ApplyTemplate') && !systemTags.includes('template')) {
          systemTags.push('ApplyTemplate');
        } else if (!attributes.template || wasHardcoded) {
          // Can't set template if hardcoded
          systemTags = systemTags.filter(t => t !== 'ApplyTemplate' && t !== 'template') as SystemTag[];
        }
      }
    } else if (wasHardcoded) {
      // If no attributes provided but entry was hardcoded, preserve protected tag
      if (!systemTags.includes('protected')) {
        systemTags.push('protected');
      }
      // Protected means readonly (remove LLMWrite, add readonly for backward compat)
      systemTags = systemTags.filter(t => t !== 'LLMWrite') as SystemTag[];
      if (!systemTags.includes('readonly')) {
        systemTags.push('readonly');
      }
      systemTags = systemTags.filter(t => t !== 'template') as SystemTag[];
    }

    // Enforce: protected (hardcoded) implies readonly (no LLMWrite) and NOT template
    // Always preserve hardcoded status if entry was hardcoded
    if (wasHardcoded && !systemTags.includes('protected')) {
      systemTags.push('protected');
    }
    if (systemTags.includes('protected')) {
      // Protected means readonly (remove LLMWrite, add readonly for backward compat)
      systemTags = systemTags.filter(t => t !== 'LLMWrite') as SystemTag[];
      if (!systemTags.includes('readonly')) {
        systemTags.push('readonly');
      }
      systemTags = systemTags.filter(t => t !== 'template') as SystemTag[];
    }

    // Store normalized tags
    finalAttributes.systemTags = systemTags;

    // Sync legacy attributes FROM systemTags (canonical source)
    // readonly = NOT LLMWrite (if LLMWrite not present, or if readonly tag present)
    finalAttributes.readonly = systemTags.includes('readonly') || !systemTags.includes('LLMWrite');
    // visible = SystemPrompt (or prompt for backward compat)
    finalAttributes.visible = this.hasSystemPrompt(systemTags);
    // Always preserve hardcoded status if entry was hardcoded
    finalAttributes.hardcoded = wasHardcoded || systemTags.includes('protected');
    finalAttributes.template = systemTags.includes('ApplyTemplate') || systemTags.includes('template');

    // Sync tags <-> contentTags bidirectionally
    // If tags was explicitly provided, use it as source for contentTags
    if (attributes && 'tags' in attributes && attributes.tags) {
      finalAttributes.contentTags = [...attributes.tags];
    }
    // Always sync tags FROM contentTags (canonical source)
    finalAttributes.tags = [...(finalAttributes.contentTags || [])];

    this.stm[key] = {
      value,
      attributes: finalAttributes
    };

    if (this.listeners[key]) {
      this.listeners[key].forEach(listener => listener(value));
    }
    this.notifyGlobalListeners();
  }

  // Internal method for setting values from remote (cloud sync)
  // This doesn't trigger the global listener to prevent sync loops
  _setFromRemote(key: string, value: any, attributes: KeyAttributes): void {
    if (key === '$date' || key === '$time') {
      return;
    }

    this._isRemoteUpdate = true;

    // Ensure new tag arrays exist and sync legacy attributes
    let systemTags: SystemTag[] = attributes.systemTags || [];
    if (!attributes.systemTags || systemTags.length === 0) {
      systemTags = [];
      if (attributes.visible !== false) {
        systemTags.push('prompt'); // Will be normalized to SystemPrompt
      }
      if (attributes.readonly) {
        systemTags.push('readonly'); // Will be normalized (removes LLMWrite)
      } else {
        systemTags.push('LLMWrite'); // Default: writable
      }
      if (attributes.hardcoded) {
        systemTags.push('protected');
      }
      if (attributes.template) {
        systemTags.push('ApplyTemplate');
      }
    }

    // Normalize tags (migrate old tags to new ones)
    systemTags = this.normalizeSystemTags(systemTags);

    const contentTags = attributes.contentTags || attributes.tags || [];

    this.stm[key] = {
      value,
      attributes: {
        ...attributes,
        contentTags,
        systemTags,
        zIndex: attributes.zIndex ?? 0,
        tags: contentTags,
        // Sync legacy attributes FROM normalized systemTags
        readonly: systemTags.includes('readonly') || !systemTags.includes('LLMWrite'),
        visible: this.hasSystemPrompt(systemTags),
        hardcoded: systemTags.includes('protected'),
        template: systemTags.includes('ApplyTemplate') || systemTags.includes('template')
      }
    };

    if (this.listeners[key]) {
      this.listeners[key].forEach(listener => listener(value));
    }

    // Still notify global listeners for UI updates, but adapter should check _isRemoteUpdate
    this.notifyGlobalListeners();

    this._isRemoteUpdate = false;
  }

  // Check if current update is from remote
  isRemoteUpdate(): boolean {
    return this._isRemoteUpdate;
  }

  // Internal method for deleting from remote (cloud sync)
  _deleteFromRemote(key: string): void {
    if (key === '$date' || key === '$time') {
      return;
    }

    this._isRemoteUpdate = true;

    if (key in this.stm) {
      delete this.stm[key];
      if (this.listeners[key]) {
        this.listeners[key].forEach(listener => listener(undefined)); // Pass undefined for deleted keys
      }
      this.notifyGlobalListeners();
    }

    this._isRemoteUpdate = false;
  }

  // Internal method for clearing from remote (cloud sync)
  _clearFromRemote(): void {
    this._isRemoteUpdate = true;
    this.stm = {};
    this.notifyGlobalListeners();
    this._isRemoteUpdate = false;
  }

  // Set attributes for an existing key
  set_attributes(key: string, attributes: Partial<KeyAttributes>): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    // Preserve hardcoded status - if entry is hardcoded, it must remain hardcoded
    const wasHardcoded = entry.attributes.hardcoded || entry.attributes.systemTags?.includes('protected');

    // Don't allow direct modification of hardcoded or systemTags without system access
    const { hardcoded: _hardcoded, systemTags: _systemTags, ...allowedAttributes } = attributes;

    // If entry is hardcoded (protected), don't allow changing readonly to false or template to true
    if (wasHardcoded) {
      if ('readonly' in allowedAttributes) {
        delete (allowedAttributes as any).readonly; // Can't change readonly on hardcoded
      }
      if ('template' in allowedAttributes) {
        delete (allowedAttributes as any).template; // Can't change ApplyTemplate on hardcoded
      }
    }

    entry.attributes = { ...entry.attributes, ...allowedAttributes };

    // Sync legacy boolean to systemTags if legacy props are set
    if ('readonly' in attributes || 'visible' in attributes || 'template' in attributes || 'systemTags' in attributes) {
      // Start with existing tags or derive from legacy attributes
      let newSystemTags: SystemTag[] = entry.attributes.systemTags || [];

      // If systemTags was explicitly provided, use it and normalize
      if ('systemTags' in attributes && Array.isArray(attributes.systemTags)) {
        newSystemTags = this.normalizeSystemTags(attributes.systemTags);
      } else {
        // Otherwise, derive from legacy attributes
        newSystemTags = [];
        if (!entry.attributes.readonly) {
          newSystemTags.push('LLMWrite');
        } else {
          newSystemTags.push('readonly');
        }
        if (entry.attributes.visible) {
          newSystemTags.push('SystemPrompt');
        }
        if (entry.attributes.template) {
          newSystemTags.push('ApplyTemplate');
        }
        // Always preserve hardcoded status if it was hardcoded
        if (wasHardcoded || entry.attributes.hardcoded) {
          newSystemTags.push('protected');
        }
        newSystemTags = this.normalizeSystemTags(newSystemTags);
      }

      // Enforce: protected implies readonly (no LLMWrite) and NOT ApplyTemplate
      if (newSystemTags.includes('protected')) {
        newSystemTags = newSystemTags.filter(t => t !== 'LLMWrite') as SystemTag[];
        if (!newSystemTags.includes('readonly')) {
          newSystemTags.push('readonly');
        }
        newSystemTags = newSystemTags.filter(t => t !== 'ApplyTemplate' && t !== 'template') as SystemTag[];
        entry.attributes.readonly = true;
        entry.attributes.template = false;
      }

      entry.attributes.systemTags = newSystemTags;

      // Sync legacy attributes FROM normalized systemTags
      entry.attributes.readonly = newSystemTags.includes('readonly') || !newSystemTags.includes('LLMWrite');
      entry.attributes.visible = this.hasSystemPrompt(newSystemTags);
      entry.attributes.template = newSystemTags.includes('ApplyTemplate') || newSystemTags.includes('template');
    } else if (wasHardcoded) {
      // If no legacy props were set but entry was hardcoded, ensure protected tag is preserved
      let systemTags = this.normalizeSystemTags(entry.attributes.systemTags || []);
      if (!systemTags.includes('protected')) {
        systemTags.push('protected');
      }
      // Protected means readonly (remove LLMWrite, add readonly for backward compat)
      systemTags = systemTags.filter(t => t !== 'LLMWrite') as SystemTag[];
      if (!systemTags.includes('readonly')) {
        systemTags.push('readonly');
      }
      systemTags = systemTags.filter(t => t !== 'ApplyTemplate' && t !== 'template') as SystemTag[];
      entry.attributes.systemTags = systemTags;

      // Sync legacy attributes
      entry.attributes.readonly = true;
      entry.attributes.visible = this.hasSystemPrompt(systemTags);
      entry.attributes.template = false;
    }

    // Always ensure hardcoded status is preserved and synced
    if (wasHardcoded) {
      entry.attributes.hardcoded = true;
      if (!entry.attributes.systemTags?.includes('protected')) {
        entry.attributes.systemTags = [...(entry.attributes.systemTags || []), 'protected'] as SystemTag[];
      }
      entry.attributes.readonly = true;
      entry.attributes.template = false;
    }

    // Sync contentTags to legacy tags
    if ('contentTags' in attributes) {
      entry.attributes.tags = [...(entry.attributes.contentTags || [])];
    }

    this.notifyGlobalListeners();
    return true;
  }

  set(key: string, value: any): void {
    this.set_value(key, value);
  }

  async set_file(key: string, file: File, attributes?: Partial<KeyAttributes>): Promise<void> {
    const base64Data = await this.encodeFileToBase64(file);
    const contentType = file.type;

    const fileAttributes: Partial<KeyAttributes> = {
      type: contentType.startsWith('image/') ? 'image' : 'file',
      contentType,
      ...attributes
    };

    this.set_value(key, base64Data, fileAttributes);
  }

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

  add_image(key: string, base64Data: string, contentType: string = 'image/jpeg', attributes?: Partial<KeyAttributes>): void {
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid image content type: ${contentType}. Must start with 'image/'`);
    }

    this.set_base64(key, base64Data, contentType, 'image', attributes);
    this.set_attributes(key, {
      type: 'image',
      contentType: contentType
    });
  }

  get_data_url(key: string): string | undefined {
    const entry = this.stm[key];
    if (!entry || (entry.attributes.type !== 'image' && entry.attributes.type !== 'file')) {
      return undefined;
    }

    if (!entry.attributes.contentType) {
      return undefined;
    }

    return this.createDataUrl(entry.value as string, entry.attributes.contentType);
  }

  get_base64(key: string): string | undefined {
    const entry = this.stm[key];
    if (!entry || (entry.attributes.type !== 'image' && entry.attributes.type !== 'file')) {
      return undefined;
    }

    return entry.value as string;
  }

  has(key: string): boolean {
    if (key === '$date' || key === '$time') {
      return true;
    }
    return key in this.stm;
  }

  delete(key: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }
    if (!(key in this.stm)) {
      return false;
    }
    const deleted = delete this.stm[key];
    if (deleted) {
      this.notifyGlobalListeners();
      if (this.listeners[key]) {
        this.listeners[key].forEach(listener => listener(undefined)); // Pass undefined for deleted keys
      }
    }
    return deleted;
  }

  clear(): void {
    this.stm = {};
    this.notifyGlobalListeners();
  }

  /**
   * Get keys sorted by zIndex (ascending), then by key name
   */
  private getSortedKeys(): string[] {
    return Object.entries(this.stm)
      .sort(([keyA, entryA], [keyB, entryB]) => {
        const zIndexA = entryA.attributes.zIndex ?? 0;
        const zIndexB = entryB.attributes.zIndex ?? 0;
        if (zIndexA !== zIndexB) {
          return zIndexA - zIndexB;
        }
        return keyA.localeCompare(keyB);
      })
      .map(([key]) => key);
  }

  keys(): string[] {
    return [...this.getSortedKeys(), '$date', '$time'];
  }

  values(): any[] {
    const now = new Date();
    const sortedKeys = this.getSortedKeys();
    const stmValues = sortedKeys.map(key => this.stm[key].value);
    return [
      ...stmValues,
      now.toISOString().split('T')[0],
      now.toTimeString().split(' ')[0]
    ];
  }

  entries(): [string, any][] {
    const now = new Date();
    const sortedKeys = this.getSortedKeys();
    const stmEntries = sortedKeys.map(key =>
      [key, this.stm[key].value] as [string, any]
    );
    return [
      ...stmEntries,
      ['$date', now.toISOString().split('T')[0]],
      ['$time', now.toTimeString().split(' ')[0]]
    ];
  }

  size(): number {
    return Object.keys(this.stm).length + 2;
  }

  getAll(): Record<string, any> {
    const now = new Date();
    const result: Record<string, any> = {};

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      result[key] = this.stm[key].value;
    });

    result['$date'] = now.toISOString().split('T')[0];
    result['$time'] = now.toTimeString().split(' ')[0];

    return result;
  }

  update(newValues: Record<string, any>): void {
    Object.entries(newValues).forEach(([key, value]) => {
      if (key !== '$date' && key !== '$time') {
        this.stm[key] = {
          value,
          attributes: { ...DEFAULT_KEY_ATTRIBUTES }
        };

        if (this.listeners[key]) {
          this.listeners[key].forEach(listener => listener(this.stm[key]?.value));
        }
      }
    });
    this.notifyGlobalListeners();
  }

  subscribe(key: string, listener: Listener): void {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(listener);
  }

  unsubscribe(key: string, listener: Listener): void {
    if (this.listeners[key]) {
      this.listeners[key] = this.listeners[key].filter(l => l !== listener);
    }
  }

  subscribeToAll(listener: GlobalListener): void {
    this.globalListeners.push(listener);
  }

  unsubscribeFromAll(listener: GlobalListener): void {
    this.globalListeners = this.globalListeners.filter(l => l !== listener);
  }

  private notifyGlobalListeners(): void {
    this.globalListeners.forEach(listener => listener());
  }

  injectSTM(template: string, _processingStack?: Set<string>): string {
    if (template === null || template === undefined) {
      return String(template);
    }

    const templateStr = String(template);
    const keys = templateStr.match(/\{\{([$\w]+)\}\}/g);

    if (!keys) {
      return templateStr;
    }

    const cleanKeys = keys.map(key => key.replace(/[{}]/g, ''));

    const inputValues: Record<string, string> = cleanKeys.reduce((acc, key) => {
      if (key === '$date' || key === '$time') {
        return {
          ...acc,
          [key]: this.get_value(key, _processingStack)
        };
      }

      const attributes = this.get_attributes(key);
      if (_processingStack || (attributes && attributes.visible)) {
        if (attributes && (attributes.type === 'image' || attributes.type === 'file')) {
          return acc;
        }

        return {
          ...acc,
          [key]: this.get_value(key, _processingStack)
        };
      }

      return acc;
    }, {});

    return templateStr.replace(/\{\{([$\w]+)\}\}/g, (match, key) => {
      if (inputValues[key] !== undefined) {
        return inputValues[key];
      }

      const attributes = this.get_attributes(key);
      if (attributes && (attributes.type === 'image' || attributes.type === 'file')) {
        return match;
      }

      return '';
    });
  }

  getSTM(): string {
    const now = new Date();
    const entries: Array<[string, any]> = [];

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entry = this.stm[key];
      if (entry.attributes.visible) {
        entries.push([key, this.get_value(key)]);
      }
    });

    entries.push(['$date', now.toISOString().split('T')[0]]);
    entries.push(['$time', now.toTimeString().split(' ')[0]]);

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  getSTMObject(): Record<string, any> {
    return this.getAll();
  }

  getSTMForAPI(): Array<{ key: string, value: any, type: string, contentType?: string }> {
    const now = new Date();
    const apiData: Array<{ key: string, value: any, type: string, contentType?: string }> = [];

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entry = this.stm[key];
      // Check for LLMRead or SystemPrompt tag (or visible for backward compat)
      if (this.hasLLMRead(entry.attributes.systemTags) || entry.attributes.visible) {
        const hasTemplate = entry.attributes.systemTags?.includes('ApplyTemplate') || entry.attributes.systemTags?.includes('template') || entry.attributes.template;
        const processedValue = hasTemplate ? this.get_value(key) : entry.value;

        apiData.push({
          key,
          value: processedValue,
          type: entry.attributes.type,
          contentType: entry.attributes.contentType
        });
      }
    });

    apiData.push({
      key: '$date',
      value: now.toISOString().split('T')[0],
      type: 'text'
    });

    apiData.push({
      key: '$time',
      value: now.toTimeString().split(' ')[0],
      type: 'text'
    });

    return apiData;
  }

  getVisibleImages(): Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> {
    const imageParts: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> = [];

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entry = this.stm[key];
      // Check for LLMRead or SystemPrompt tag (or visible for backward compat)
      if ((this.hasLLMRead(entry.attributes.systemTags) || entry.attributes.visible) && entry.attributes.type === 'image' && entry.attributes.contentType) {
        const dataUrl = this.createDataUrl(entry.value as string, entry.attributes.contentType);
        imageParts.push({
          type: 'file' as const,
          mediaType: entry.attributes.contentType,
          url: dataUrl,
          filename: key
        });
      }
    });

    return imageParts;
  }

  toJSON(): string {
    return JSON.stringify(this.serialize());
  }

  fromJSON(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      this.deserialize(data);
    } catch (error) {
      console.error('MindCache: Failed to deserialize JSON:', error);
    }
  }

  serialize(): Record<string, STMEntry> {
    const result: Record<string, STMEntry> = {};

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entry = this.stm[key];
      if (!entry.attributes.hardcoded) {
        result[key] = {
          value: entry.value,
          attributes: { ...entry.attributes }
        };
      }
    });

    return result;
  }

  deserialize(data: Record<string, STMEntry>): void {
    if (typeof data === 'object' && data !== null) {
      // Set flag to prevent adapters from saving data we just loaded
      this._isRemoteUpdate = true;

      this.clear();

      Object.entries(data).forEach(([key, entry]) => {
        if (entry && typeof entry === 'object' && 'value' in entry && 'attributes' in entry) {
          const attrs = entry.attributes;

          // Skip hardcoded keys during deserialization
          if (attrs.hardcoded === true || attrs.systemTags?.includes('protected')) {
            return;
          }

          // Migrate from legacy format: derive systemTags from boolean flags if missing
          let systemTags: SystemTag[] = attrs.systemTags || [];
          if (!attrs.systemTags || systemTags.length === 0) {
            systemTags = [];
            if (attrs.visible !== false) {
              systemTags.push('prompt'); // Will be normalized to SystemPrompt
            } // visible true by default
            if (attrs.readonly) {
              systemTags.push('readonly'); // Will be normalized (removes LLMWrite)
            } else {
              systemTags.push('LLMWrite'); // Default: writable
            }
            if (attrs.hardcoded) {
              systemTags.push('protected');
            }
            if (attrs.template) {
              systemTags.push('ApplyTemplate');
            }
          }

          // Normalize tags (migrate old tags to new ones)
          systemTags = this.normalizeSystemTags(systemTags);

          // Migrate contentTags from legacy tags if missing
          const contentTags = attrs.contentTags || attrs.tags || [];

          this.stm[key] = {
            value: entry.value,
            attributes: {
              ...attrs,
              contentTags,
              systemTags,
              zIndex: attrs.zIndex ?? 0,
              // Sync legacy attributes FROM normalized systemTags
              tags: contentTags,
              readonly: systemTags.includes('readonly') || !systemTags.includes('LLMWrite'),
              visible: this.hasSystemPrompt(systemTags),
              hardcoded: systemTags.includes('protected'),
              template: systemTags.includes('ApplyTemplate') || systemTags.includes('template')
            }
          };
        }
      });

      this.notifyGlobalListeners();

      // Reset flag after notify
      this._isRemoteUpdate = false;
    }
  }

  get_system_prompt(): string {
    const now = new Date();
    const promptLines: string[] = [];

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entry = this.stm[key];
      // Check for LLMRead or SystemPrompt tag (or visible for backward compat)
      if (this.hasLLMRead(entry.attributes.systemTags) || entry.attributes.visible) {
        if (entry.attributes.type === 'image') {
          promptLines.push(`image ${key} available`);
          return;
        }
        if (entry.attributes.type === 'file') {
          // Check if LLM can write (has LLMWrite tag and not readonly)
          const canWrite = this.hasLLMWrite(entry.attributes.systemTags) || (!entry.attributes.readonly && !entry.attributes.systemTags.includes('readonly'));
          if (!canWrite) {
            promptLines.push(`${key}: [${entry.attributes.type.toUpperCase()}] - ${entry.attributes.contentType || 'unknown format'}`);
          } else {
            const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
            promptLines.push(`${key}: [${entry.attributes.type.toUpperCase()}] - ${entry.attributes.contentType || 'unknown format'}. You can update this ${entry.attributes.type} using the write_${sanitizedKey} tool.`);
          }
          return;
        }

        const value = this.get_value(key);
        const formattedValue = typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);

        // Check if LLM can write (has LLMWrite tag and not readonly)
        const canWrite = this.hasLLMWrite(entry.attributes.systemTags) || (!entry.attributes.readonly && !entry.attributes.systemTags.includes('readonly'));
        if (!canWrite) {
          promptLines.push(`${key}: ${formattedValue}`);
        } else {
          const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
          const toolInstruction =
            `You can rewrite "${key}" by using the write_${sanitizedKey} tool. ` +
            'This tool DOES NOT append — start your response with the old value ' +
            `(${formattedValue})`;
          promptLines.push(`${key}: ${formattedValue}. ${toolInstruction}`);
        }
      }
    });

    promptLines.push(`$date: ${now.toISOString().split('T')[0]}`);
    promptLines.push(`$time: ${now.toTimeString().split(' ')[0]}`);

    return promptLines.join('\n');
  }

  private findKeyFromToolName(toolName: string): string | undefined {
    if (!toolName.startsWith('write_')) {
      return undefined;
    }

    const sanitizedKey = toolName.replace('write_', '');
    const sortedKeys = this.getSortedKeys();
    return sortedKeys.find(k =>
      k.replace(/[^a-zA-Z0-9_-]/g, '_') === sanitizedKey
    );
  }

  get_aisdk_tools(): Record<string, any> {
    const tools: Record<string, any> = {};

    const sortedKeys = this.getSortedKeys();
    const writableKeys = sortedKeys.filter(key => {
      const entry = this.stm[key];
      // Include if has LLMWrite tag (and not readonly), or if legacy readonly is false
      return this.hasLLMWrite(entry.attributes.systemTags) || (!entry.attributes.readonly && !entry.attributes.systemTags.includes('readonly'));
    });

    writableKeys.forEach(key => {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      const toolName = `write_${sanitizedKey}`;

      const entry = this.stm[key];
      const keyType = entry?.attributes.type || 'text';

      let inputSchema;
      let description = `Write a value to the STM key: ${key}`;

      if (keyType === 'image' || keyType === 'file') {
        description += ' (expects base64 encoded data)';
        inputSchema = z.object({
          value: z.string().describe(`Base64 encoded data for ${key}`),
          contentType: z.string().optional().describe(`MIME type for the ${keyType}`)
        });
      } else if (keyType === 'json') {
        description += ' (expects JSON string)';
        inputSchema = z.object({
          value: z.string().describe(`JSON string value for ${key}`)
        });
      } else {
        inputSchema = z.object({
          value: z.string().describe(`The text value to write to ${key}`)
        });
      }

      tools[toolName] = {
        description,
        inputSchema,
        execute: async (input: { value: any; contentType?: string }) => {
          if (keyType === 'image' || keyType === 'file') {
            if (input.contentType) {
              this.set_base64(key, input.value, input.contentType, keyType);
            } else {
              const existingContentType = entry?.attributes.contentType;
              if (existingContentType) {
                this.set_base64(key, input.value, existingContentType, keyType);
              } else {
                throw new Error(`Content type required for ${keyType} data`);
              }
            }
          } else {
            this.set_value(key, input.value);
          }

          let resultMessage: string;
          if (keyType === 'image') {
            resultMessage = `Successfully saved image to ${key}`;
          } else if (keyType === 'file') {
            resultMessage = `Successfully saved file to ${key}`;
          } else if (keyType === 'json') {
            resultMessage = `Successfully saved JSON data to ${key}`;
          } else {
            resultMessage = `Successfully wrote "${input.value}" to ${key}`;
          }

          return {
            result: resultMessage,
            key: key,
            value: input.value,
            type: keyType,
            contentType: input.contentType,
            sanitizedKey: sanitizedKey
          };
        }
      };
    });

    if (writableKeys.length === 0) {
      return {};
    }

    return tools;
  }

  executeToolCall(
    toolName: string,
    value: any
  ): { result: string; key: string; value: any } | null {
    const originalKey = this.findKeyFromToolName(toolName);
    if (!originalKey) {
      return null;
    }

    const entry = this.stm[originalKey];
    // Check if LLM can write (has LLMWrite tag and not readonly)
    const canWrite = entry && (this.hasLLMWrite(entry.attributes.systemTags) || (!entry.attributes.readonly && !entry.attributes.systemTags.includes('readonly')));
    if (!canWrite) {
      return null;
    }

    this.set_value(originalKey, value);
    return {
      result: `Successfully wrote "${value}" to ${originalKey}`,
      key: originalKey,
      value: value
    };
  }

  // ============================================
  // Content Tag Methods (available to all access levels)
  // ============================================

  /**
   * Add a content tag to a key (user-level organization)
   */
  addTag(key: string, tag: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    if (!entry.attributes.contentTags) {
      entry.attributes.contentTags = [];
    }

    if (!entry.attributes.contentTags.includes(tag)) {
      entry.attributes.contentTags.push(tag);
      // Sync legacy tags array
      entry.attributes.tags = [...entry.attributes.contentTags];
      this.notifyGlobalListeners();
      return true;
    }

    return false;
  }

  /**
   * Remove a content tag from a key
   */
  removeTag(key: string, tag: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry || !entry.attributes.contentTags) {
      return false;
    }

    const tagIndex = entry.attributes.contentTags.indexOf(tag);
    if (tagIndex > -1) {
      entry.attributes.contentTags.splice(tagIndex, 1);
      // Sync legacy tags array
      entry.attributes.tags = [...entry.attributes.contentTags];
      this.notifyGlobalListeners();
      return true;
    }

    return false;
  }

  /**
   * Get all content tags for a key
   */
  getTags(key: string): string[] {
    if (key === '$date' || key === '$time') {
      return [];
    }

    const entry = this.stm[key];
    return entry?.attributes.contentTags || [];
  }

  /**
   * Get all unique content tags across all keys
   */
  getAllTags(): string[] {
    const allTags = new Set<string>();

    Object.values(this.stm).forEach(entry => {
      if (entry.attributes.contentTags) {
        entry.attributes.contentTags.forEach(tag => allTags.add(tag));
      }
    });

    return Array.from(allTags);
  }

  /**
   * Check if a key has a specific content tag
   */
  hasTag(key: string, tag: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    return entry?.attributes.contentTags?.includes(tag) || false;
  }

  /**
   * Get all keys with a specific content tag as formatted string
   */
  getTagged(tag: string): string {
    const entries: Array<[string, any]> = [];

    const sortedKeys = this.getSortedKeys();
    sortedKeys.forEach(key => {
      const entry = this.stm[key];
      if (entry.attributes.contentTags?.includes(tag)) {
        entries.push([key, this.get_value(key)]);
      }
    });

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  /**
   * Get all keys with a specific content tag
   */
  getKeysByTag(tag: string): string[] {
    const sortedKeys = this.getSortedKeys();
    return sortedKeys.filter(key => {
      const entry = this.stm[key];
      return entry.attributes.contentTags?.includes(tag);
    });
  }

  // ============================================
  // System Tag Methods (requires system access level)
  // ============================================

  /**
   * Add a system tag to a key (requires system access)
   * System tags: 'prompt', 'readonly', 'protected', 'template'
   */
  systemAddTag(key: string, tag: SystemTag): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemAddTag requires system access level');
      return false;
    }

    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    if (!entry.attributes.systemTags) {
      entry.attributes.systemTags = [];
    }

    if (!entry.attributes.systemTags.includes(tag)) {
      entry.attributes.systemTags.push(tag);
      // Sync legacy boolean attributes
      this.syncLegacyFromSystemTags(entry);
      this.notifyGlobalListeners();
      return true;
    }

    return false;
  }

  /**
   * Remove a system tag from a key (requires system access)
   */
  systemRemoveTag(key: string, tag: SystemTag): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemRemoveTag requires system access level');
      return false;
    }

    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry || !entry.attributes.systemTags) {
      return false;
    }

    // Prevent removing 'protected' tag from hardcoded keys
    const isHardcoded = entry.attributes.hardcoded || entry.attributes.systemTags.includes('protected');
    if (tag === 'protected' && isHardcoded) {
      return false; // Cannot remove protected tag from hardcoded keys
    }

    const tagIndex = entry.attributes.systemTags.indexOf(tag);
    if (tagIndex > -1) {
      entry.attributes.systemTags.splice(tagIndex, 1);
      // Sync legacy boolean attributes
      this.syncLegacyFromSystemTags(entry);
      // Ensure hardcoded status is preserved
      if (isHardcoded) {
        if (!entry.attributes.systemTags.includes('protected')) {
          entry.attributes.systemTags.push('protected');
        }
        entry.attributes.hardcoded = true;
        entry.attributes.readonly = true;
        entry.attributes.template = false;
      }
      this.notifyGlobalListeners();
      return true;
    }

    return false;
  }

  /**
   * Get all system tags for a key (requires system access)
   */
  systemGetTags(key: string): SystemTag[] {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemGetTags requires system access level');
      return [];
    }

    if (key === '$date' || key === '$time') {
      return [];
    }

    const entry = this.stm[key];
    return entry?.attributes.systemTags || [];
  }

  /**
   * Check if a key has a specific system tag (requires system access)
   */
  systemHasTag(key: string, tag: SystemTag): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemHasTag requires system access level');
      return false;
    }

    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    return entry?.attributes.systemTags?.includes(tag) || false;
  }

  /**
   * Set all system tags for a key at once (requires system access)
   */
  systemSetTags(key: string, tags: SystemTag[]): boolean {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemSetTags requires system access level');
      return false;
    }

    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    entry.attributes.systemTags = [...tags];
    // Sync legacy boolean attributes
    this.syncLegacyFromSystemTags(entry);
    this.notifyGlobalListeners();
    return true;
  }

  /**
   * Get all keys with a specific system tag (requires system access)
   */
  systemGetKeysByTag(tag: SystemTag): string[] {
    if (!this.hasSystemAccess) {
      console.warn('MindCache: systemGetKeysByTag requires system access level');
      return [];
    }

    const sortedKeys = this.getSortedKeys();
    return sortedKeys.filter(key => {
      const entry = this.stm[key];
      return entry.attributes.systemTags?.includes(tag);
    });
  }

  /**
   * Helper to sync legacy boolean attributes from system tags
   */
  private syncLegacyFromSystemTags(entry: STMEntry): void {
    const tags = entry.attributes.systemTags || [];
    entry.attributes.readonly = tags.includes('readonly');
    entry.attributes.visible = tags.includes('prompt');
    entry.attributes.hardcoded = tags.includes('protected');
    entry.attributes.template = tags.includes('ApplyTemplate') || tags.includes('template');
  }

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
      const entry = this.stm[key];
      if (entry.attributes.hardcoded) {
        return;
      }

      lines.push(`### ${key}`);
      const entryType = (entry.attributes.type && (entry.attributes.type as any) !== 'undefined') ? entry.attributes.type : 'text';
      lines.push(`- **Type**: \`${entryType}\``);
      lines.push(`- **Readonly**: \`${entry.attributes.readonly}\``);
      lines.push(`- **Visible**: \`${entry.attributes.visible}\``);
      lines.push(`- **Template**: \`${entry.attributes.template}\``);
      lines.push(`- **Z-Index**: \`${entry.attributes.zIndex ?? 0}\``);

      if (entry.attributes.tags && entry.attributes.tags.length > 0) {
        lines.push(`- **Tags**: \`${entry.attributes.tags.join('`, `')}\``);
      }

      if (entry.attributes.contentType) {
        lines.push(`- **Content Type**: \`${entry.attributes.contentType}\``);
      }

      if (entryType === 'image' || entryType === 'file') {
        const label = String.fromCharCode(65 + appendixCounter);
        appendixCounter++;
        lines.push(`- **Value**: [See Appendix ${label}]`);

        appendixEntries.push({
          key,
          type: entryType,
          contentType: entry.attributes.contentType || 'application/octet-stream',
          base64: entry.value as string,
          label
        });
      } else if (entryType === 'json') {
        lines.push('- **Value**:');
        lines.push('```json');
        try {
          const jsonValue = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2);
          lines.push(jsonValue);
        } catch {
          lines.push(String(entry.value));
        }
        lines.push('```');
      } else {
        const valueStr = String(entry.value);
        lines.push('- **Value**:');
        lines.push('```');
        lines.push(valueStr);
        lines.push('```');
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    });

    if (appendixEntries.length > 0) {
      lines.push('## Appendix: Binary Data');
      lines.push('');

      appendixEntries.forEach(({ key, contentType, base64, label }) => {
        lines.push(`### Appendix ${label}: ${key}`);
        lines.push(`**Type**: ${contentType}`);
        lines.push('');
        lines.push('```');
        lines.push(base64);
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    lines.push('*End of MindCache Export*');

    return lines.join('\n');
  }

  fromMarkdown(markdown: string): void {
    const lines = markdown.split('\n');
    let currentSection: 'header' | 'entries' | 'appendix' = 'header';
    let currentKey: string | null = null;
    let currentEntry: Partial<STMEntry> | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockType: 'value' | 'json' | 'base64' | 'default' | null = null;
    const appendixData: Record<string, { contentType: string; base64: string }> = {};
    let currentAppendixKey: string | null = null;
    const pendingEntries: Record<string, Partial<STMEntry> & { appendixLabel?: string }> = {};

    this.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '## STM Entries') {
        currentSection = 'entries';
        continue;
      }
      if (trimmed === '## Appendix: Binary Data') {
        currentSection = 'appendix';
        continue;
      }

      if (trimmed === '```' || trimmed === '```json') {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = [];
          codeBlockType = currentSection === 'appendix' ? 'base64' : (trimmed === '```json' ? 'json' : 'value');
        } else {
          inCodeBlock = false;
          const content = codeBlockContent.join('\n');

          if (currentSection === 'appendix' && currentAppendixKey) {
            appendixData[currentAppendixKey].base64 = content;
          } else if (currentEntry && codeBlockType === 'json') {
            currentEntry.value = content;
          } else if (currentEntry && codeBlockType === 'value') {
            currentEntry.value = content;
          }

          codeBlockContent = [];
          codeBlockType = null;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      if (currentSection === 'entries') {
        if (trimmed.startsWith('### ')) {
          if (currentKey && currentEntry && currentEntry.attributes) {
            pendingEntries[currentKey] = currentEntry as STMEntry & { appendixLabel?: string };
          }

          currentKey = trimmed.substring(4);
          currentEntry = {
            value: undefined,
            attributes: {
              ...DEFAULT_KEY_ATTRIBUTES,
              contentTags: [],
              systemTags: ['prompt'] as SystemTag[],
              tags: []
            }
          };
        } else if (trimmed.startsWith('- **Type**: `')) {
          const type = trimmed.match(/`([^`]+)`/)?.[1] as KeyAttributes['type'];
          if (currentEntry && type && (type as any) !== 'undefined') {
            currentEntry.attributes!.type = type;
          }
        } else if (trimmed.startsWith('- **Readonly**: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.readonly = value;
          }
        } else if (trimmed.startsWith('- **Visible**: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.visible = value;
          }
        } else if (trimmed.startsWith('- **Template**: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.template = value;
          }
        } else if (trimmed.startsWith('- **Z-Index**: `')) {
          const zIndexStr = trimmed.match(/`([^`]+)`/)?.[1];
          if (currentEntry && zIndexStr) {
            const zIndex = parseInt(zIndexStr, 10);
            if (!isNaN(zIndex)) {
              currentEntry.attributes!.zIndex = zIndex;
            }
          }
        } else if (trimmed.startsWith('- **Tags**: `')) {
          const tagsStr = trimmed.substring(13, trimmed.length - 1);
          if (currentEntry) {
            currentEntry.attributes!.tags = tagsStr.split('`, `');
          }
        } else if (trimmed.startsWith('- **Content Type**: `')) {
          const contentType = trimmed.match(/`([^`]+)`/)?.[1];
          if (currentEntry && contentType) {
            currentEntry.attributes!.contentType = contentType;
          }
        } else if (trimmed.startsWith('- **Value**: `')) {
          const value = trimmed.substring(14, trimmed.length - 1);
          if (currentEntry) {
            currentEntry.value = value;
          }
        } else if (trimmed.startsWith('- **Value**: [See Appendix ')) {
          const labelMatch = trimmed.match(/Appendix ([A-Z])\]/);
          if (currentEntry && labelMatch && currentKey) {
            (currentEntry as any).appendixLabel = labelMatch[1];
            currentEntry.value = '';
          }
        }
      }

      if (currentSection === 'appendix') {
        if (trimmed.startsWith('### Appendix ')) {
          const match = trimmed.match(/### Appendix ([A-Z]): (.+)/);
          if (match) {
            const label = match[1];
            const key = match[2];
            currentAppendixKey = `${label}:${key}`;
            appendixData[currentAppendixKey] = { contentType: '', base64: '' };
          }
        } else if (trimmed.startsWith('**Type**: ')) {
          const contentType = trimmed.substring(10);
          if (currentAppendixKey) {
            appendixData[currentAppendixKey].contentType = contentType;
          }
        }
      }
    }

    if (currentKey && currentEntry && currentEntry.attributes) {
      pendingEntries[currentKey] = currentEntry as STMEntry & { appendixLabel?: string };
    }

    Object.entries(pendingEntries).forEach(([key, entry]) => {
      const appendixLabel = (entry as any).appendixLabel;
      if (appendixLabel) {
        const appendixKey = `${appendixLabel}:${key}`;
        const appendixInfo = appendixData[appendixKey];
        if (appendixInfo && appendixInfo.base64) {
          entry.value = appendixInfo.base64;
          if (!entry.attributes!.contentType && appendixInfo.contentType) {
            entry.attributes!.contentType = appendixInfo.contentType;
          }
        }
      }

      if (entry.value !== undefined && entry.attributes) {
        const attrs = entry.attributes;

        // Sync tags to contentTags if tags was parsed from markdown
        if (
          attrs.tags &&
          attrs.tags.length > 0 &&
          (!attrs.contentTags || attrs.contentTags.length === 0)
        ) {
          attrs.contentTags = [...attrs.tags];
        }

        // Derive systemTags from legacy booleans if not present
        if (!attrs.systemTags || attrs.systemTags.length === 0) {
          const systemTags: SystemTag[] = [];
          if (attrs.visible !== false) {
            systemTags.push('prompt'); // Will be normalized to SystemPrompt
          }
          if (attrs.readonly) {
            systemTags.push('readonly'); // Will be normalized (removes LLMWrite)
          } else {
            systemTags.push('LLMWrite'); // Default: writable
          }
          if (attrs.hardcoded) {
            systemTags.push('protected');
          }
          if (attrs.template) {
            systemTags.push('template');
          }
          // Normalize tags (migrate old tags to new ones)
          attrs.systemTags = this.normalizeSystemTags(systemTags);
        } else {
          // Normalize existing tags
          attrs.systemTags = this.normalizeSystemTags(attrs.systemTags);
        }

        // Ensure all required fields exist
        if (!attrs.contentTags) {
          attrs.contentTags = [];
        }
        if (!attrs.tags) {
          attrs.tags = [...attrs.contentTags];
        }

        // Sync legacy attributes FROM normalized systemTags
        const normalizedTags = attrs.systemTags || [];
        attrs.readonly = normalizedTags.includes('readonly') || !normalizedTags.includes('LLMWrite');
        attrs.visible = this.hasSystemPrompt(normalizedTags);
        attrs.hardcoded = normalizedTags.includes('protected');
        attrs.template = normalizedTags.includes('ApplyTemplate') || normalizedTags.includes('template');

        this.stm[key] = {
          value: entry.value,
          attributes: attrs as KeyAttributes
        };
      }
    });

    this.notifyGlobalListeners();
  }
}

// Create and export a single instance of MindCache
export const mindcache = new MindCache();

