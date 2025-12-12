/**
 * Shared types between client and server
 */

/**
 * Key attributes that can be set on a MindCache entry
 */
export interface KeyAttributes {
  readonly: boolean;
  visible: boolean;
  hardcoded: boolean;
  template: boolean;
  type: 'text' | 'image' | 'file' | 'json';
  contentType?: string;
  tags?: string[];
  zIndex?: number;
}

/**
 * A single entry in the MindCache store
 */
export interface KeyEntry {
  value: unknown;
  attributes: KeyAttributes;
  updatedAt: number;
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

