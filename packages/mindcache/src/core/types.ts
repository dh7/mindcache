/**
 * Attributes that can be set on a MindCache key
 */
export interface KeyAttributes {
  /** If true, the key cannot be modified by AI tools */
  readonly: boolean;
  /** If true, the key is included in system prompts */
  visible: boolean;
  /** If true, the key is a system key that cannot be deleted */
  hardcoded: boolean;
  /** If true, the value will be processed through template injection */
  template: boolean;
  /** The type of value stored */
  type: 'text' | 'image' | 'file' | 'json';
  /** MIME type for files/images */
  contentType?: string;
  /** Tags for categorizing keys */
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
  readonly: false,
  visible: true,
  hardcoded: false,
  template: false,
  type: 'text',
  tags: [],
};

