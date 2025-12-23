/**
 * Shared types between client and server
 */

/**
 * Known system tags that control key behavior
 */
export type SystemTag =
  | 'SystemPrompt'   // Include in system prompt (visible to LLM context)
  | 'LLMRead'        // LLM can read this key
  | 'LLMWrite'       // LLM can write to this key via tools
  | 'protected'      // Cannot be deleted
  | 'ApplyTemplate'; // Process value through template injection

/**
 * Key type - the type of value stored
 */
export type KeyType = 'text' | 'image' | 'file' | 'json' | 'document';

/**
 * Key attributes that can be set on a MindCache entry
 */
export interface KeyAttributes {
  /** The type of value stored */
  type: KeyType;
  /** MIME type for files/images */
  contentType?: string;
  /** User-defined tags for organizing keys */
  contentTags: string[];
  /** System tags that control key behavior */
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
export interface KeyEntry {
  value: unknown;
  attributes: KeyAttributes;
  updatedAt?: number;
}

/**
 * User types
 */
export type UserType = 'human' | 'app' | 'agent';

/**
 * Permission levels
 */
export type Permission = 'read' | 'write' | 'admin';

/**
 * Share target types
 */
export type ShareTargetType = 'user' | 'group' | 'api_key' | 'public';

/**
 * API Key scope types
 */
export type ApiKeyScopeType = 'account' | 'project' | 'instance';

/**
 * Resource types that can be shared
 */
export type ResourceType = 'project' | 'instance';

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

  /** Check if key is protected from deletion */
  isProtected: (attrs: KeyAttributes): boolean =>
    attrs.systemTags.includes('protected'),

  /** Check if key uses template injection */
  hasTemplateInjection: (attrs: KeyAttributes): boolean =>
    attrs.systemTags.includes('ApplyTemplate')
};
