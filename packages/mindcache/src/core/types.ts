/**
 * Access level for MindCache operations
 * - 'user': Can only manage content tags (default)
 * - 'admin': Can manage both content tags and system tags
 */
export type AccessLevel = 'user' | 'admin';

/**
 * Context rules for filtering keys by contentTags.
 * When context is set, only keys matching ALL specified tags are visible.
 * Context is client-local and not persisted.
 */
export interface ContextRules {
  /** Tags that a key must have (AND logic - all tags must match) */
  tags: string[];
  /** Default contentTags added to keys created via create_key() in this context */
  defaultContentTags?: string[];
  /** Default systemTags added to keys created via create_key() in this context */
  defaultSystemTags?: SystemTag[];
}

/**
 * Known system tags that control key behavior
 * - 'SystemPrompt': Include in system prompt (visible to LLM context)
 * - 'LLMRead': LLM can read this key via tools
 * - 'LLMWrite': LLM can write to this key via tools
 * - 'ApplyTemplate': Process value through template injection
 */
export type SystemTag = 'SystemPrompt' | 'LLMRead' | 'LLMWrite' | 'ApplyTemplate';

/**
 * Type of value stored in a MindCache key
 */
export type KeyType = 'text' | 'image' | 'file' | 'json' | 'document';

/**
 * Attributes that can be set on a MindCache key
 */
export interface KeyAttributes {
  /** The type of value stored */
  type: KeyType;
  /** MIME type for files/images */
  contentType?: string;
  /** User-defined tags for organizing keys */
  contentTags: string[];
  /** System tags that control key behavior (requires system access) */
  systemTags: SystemTag[];
  /** Z-index for ordering keys (lower values appear first) */
  zIndex: number;
}

/**
 * Default attributes for new keys
 */
export const DEFAULT_KEY_ATTRIBUTES: KeyAttributes = {
  type: 'text',
  contentTags: [],
  systemTags: [],  // Keys are private by default - explicitly add SystemPrompt/LLMRead/LLMWrite to enable LLM access
  zIndex: 0
};

/**
 * A single entry in the MindCache store
 */
export interface STMEntry {
  value: unknown;
  attributes: KeyAttributes;
}

/**
 * The full MindCache state (key-value pairs with attributes)
 */
export type STM = {
  [key: string]: STMEntry;
};

/**
 * Listener callback for key-specific subscriptions
 * Receives the new value when the key changes
 */
export type Listener = (value: unknown) => void;

/**
 * Global listener callback for all changes
 * Called when any key changes (no parameters - use getAll() to get current state)
 */
export type GlobalListener = () => void;

/**
 * A single entry in the global history log
 */
export interface HistoryEntry {
  /** Unique identifier for this history entry */
  id: string;
  /** Timestamp when the change occurred */
  timestamp: number;
  /** Keys that were affected by this change */
  keysAffected?: string[];
}

/**
 * History options for offline and cloud modes
 */
export interface HistoryOptions {
  /** Max history entries to keep (default: 100) */
  maxEntries?: number;
  /** Save full snapshot every N entries for fast restore (default: 10) */
  snapshotInterval?: number;
}

/**
 * Helper functions for working with system tags
 */
export const SystemTagHelpers = {
  /** Check if key is writable by LLM */
  isLLMWritable: (attrs: KeyAttributes): boolean =>
    attrs.systemTags.includes('LLMWrite'),

  /** Check if key is readable by LLM (in context or via tools) */
  isLLMReadable: (attrs: KeyAttributes): boolean =>
    attrs.systemTags.includes('SystemPrompt') || attrs.systemTags.includes('LLMRead'),

  /** Check if key is included in system prompt */
  isInSystemPrompt: (attrs: KeyAttributes): boolean =>
    attrs.systemTags.includes('SystemPrompt'),

  /** Check if key uses template injection */
  hasTemplateInjection: (attrs: KeyAttributes): boolean =>
    attrs.systemTags.includes('ApplyTemplate')
};
