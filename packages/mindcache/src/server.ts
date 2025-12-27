// Core exports only - safe for server-side usage
// Use this import path when React hooks are not needed: import { MindCache } from 'mindcache/core'
export { MindCache } from './core';

// Types
export type {
  KeyAttributes,
  KeyType,
  SystemTag,
  AccessLevel,
  STM,
  STMEntry,
  STMEntry as KeyEntry,
  Listener,
  GlobalListener,
  HistoryEntry,
  HistoryOptions,
  MindCacheOptions,
  MindCacheCloudOptions,
  MindCacheIndexedDBOptions
} from './core';
export { DEFAULT_KEY_ATTRIBUTES, SystemTagHelpers } from './core';

// Cloud exports
export { CloudAdapter } from './cloud';
export type { CloudConfig, ConnectionState, CloudAdapterEvents } from './cloud';

// Local Persistence exports
export { IndexedDBAdapter } from './local';
export type { IndexedDBConfig } from './local';
