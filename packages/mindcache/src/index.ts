// Core exports (MindCache 1.0 compatible)
import { MindCache } from './core';
export { MindCache } from './core';

// Singleton instance for backwards compatibility
export const mindcache = new MindCache();

// Types - import like: import { KeyAttributes, KeyType, SystemTag } from 'mindcache'
export type {
  KeyAttributes,
  KeyType,
  SystemTag,
  AccessLevel,
  ContextRules,
  STM,
  STMEntry,
  STMEntry as KeyEntry, // Alias for compatibility
  Listener,
  GlobalListener,
  HistoryEntry,
  HistoryOptions,
  MindCacheOptions,
  MindCacheCloudOptions,
  MindCacheIndexedDBOptions
} from './core';
export { DEFAULT_KEY_ATTRIBUTES, SystemTagHelpers } from './core';

// Cloud exports (for advanced usage)
export { CloudAdapter } from './cloud';
export { OAuthClient, createOAuthClient } from './cloud/OAuthClient';
export type { CloudConfig, ConnectionState, CloudAdapterEvents } from './cloud';
export type { OAuthConfig, OAuthTokens, MindCacheUser } from './cloud/OAuthClient';

// Local Persistence exports
export { IndexedDBAdapter } from './local';
export type { IndexedDBConfig } from './local';

// React exports
export { useMindCache } from './react';
export type { UseMindCacheResult } from './react';
