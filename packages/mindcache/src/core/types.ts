/**
 * Access level for MindCache operations
 * - 'user': Can only manage content tags (default)
 * - 'system': Can manage both content tags and system tags
 */
export type AccessLevel = 'user' | 'system';

/**
 * Known system tags that control key behavior
 * - 'SystemPrompt': Include in system prompt
 * - 'LLMRead': LLM can read this key (visible to LLMs)
 * - 'LLMWrite': LLM can write to this key via tools
 * - 'protected': Cannot be deleted (replaces hardcoded)
 * - 'ApplyTemplate': Process value through template injection
 *
 * @deprecated 'prompt' - Use 'SystemPrompt' instead
 * @deprecated 'readonly' - Use absence of 'LLMWrite' instead (if LLMWrite not present, readonly=true)
 * @deprecated 'template' - Use 'ApplyTemplate' instead
 */
export type SystemTag = 'SystemPrompt' | 'LLMRead' | 'LLMWrite' | 'protected' | 'ApplyTemplate' | 'prompt' | 'readonly' | 'template';

/**
 * Attributes that can be set on a MindCache key
 */
export interface KeyAttributes {
  /** The type of value stored */
  type: 'text' | 'image' | 'file' | 'json';
  /** MIME type for files/images */
  contentType?: string;
  /** User-defined tags for organizing keys */
  contentTags: string[];
  /** System tags that control key behavior (requires system access) */
  systemTags: SystemTag[];
  /** Z-index for ordering keys (lower values appear first) */
  zIndex: number;

  // Legacy attributes - kept for backward compatibility, derived from systemTags
  /** @deprecated Use !systemTags.includes('LLMWrite') instead */
  readonly: boolean;
  /** @deprecated Use systemTags.includes('SystemPrompt') instead */
  visible: boolean;
  /** @deprecated Use systemTags.includes('protected') instead */
  hardcoded: boolean;
  /** @deprecated Use systemTags.includes('ApplyTemplate') instead */
  template: boolean;
  /** @deprecated Use contentTags instead */
  tags?: string[];
}

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
 * Default attributes for new keys
 */
export const DEFAULT_KEY_ATTRIBUTES: KeyAttributes = {
  type: 'text',
  contentTags: [],
  systemTags: ['SystemPrompt', 'LLMWrite'], // visible in system prompt and writable by LLM by default
  zIndex: 0,
  // Legacy - derived from systemTags
  readonly: false,
  visible: true,
  hardcoded: false,
  template: false,
  tags: []
};

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

