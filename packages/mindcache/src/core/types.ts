/**
 * Access level for MindCache operations
 * - 'user': Can only manage content tags (default)
 * - 'system': Can manage both content tags and system tags
 */
export type AccessLevel = 'user' | 'system';

/**
 * Known system tags that control key behavior
 * - 'prompt': Include in system prompt (replaces visible)
 * - 'readonly': Cannot be modified by AI tools (replaces readonly)
 * - 'protected': Cannot be deleted (replaces hardcoded)
 * - 'template': Process value through template injection
 */
export type SystemTag = 'prompt' | 'readonly' | 'protected' | 'template';

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

  // Legacy attributes - kept for backward compatibility, derived from systemTags
  /** @deprecated Use systemTags.includes('readonly') instead */
  readonly: boolean;
  /** @deprecated Use systemTags.includes('prompt') instead */
  visible: boolean;
  /** @deprecated Use systemTags.includes('protected') instead */
  hardcoded: boolean;
  /** @deprecated Use systemTags.includes('template') instead */
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
 * A function that is called when a key changes
 */
export type Listener = () => void;

/**
 * Default attributes for new keys
 */
export const DEFAULT_KEY_ATTRIBUTES: KeyAttributes = {
  type: 'text',
  contentTags: [],
  systemTags: ['prompt'], // visible by default
  // Legacy - derived from systemTags
  readonly: false,
  visible: true,
  hardcoded: false,
  template: false,
  tags: []
};

