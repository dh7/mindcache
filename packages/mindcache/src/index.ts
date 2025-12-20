// Core exports (MindCache 1.0 compatible)
export { MindCache } from './core';

// Types - import like: import { KeyAttributes, KeyType, SystemTag } from 'mindcache'
export type {
  KeyAttributes,
  KeyType,
  SystemTag,
  AccessLevel,
  STM,
  STMEntry,
  Listener,
  GlobalListener,
  HistoryEntry,
  HistoryOptions,
  MindCacheOptions,
  MindCacheCloudOptions,
  MindCacheIndexedDBOptions
} from './core';
export { DEFAULT_KEY_ATTRIBUTES } from './core';

// Cloud exports (for advanced usage)
export { CloudAdapter } from './cloud';
export type { CloudConfig, ConnectionState, CloudAdapterEvents } from './cloud';

// Local Persistence exports
export { IndexedDBAdapter } from './local';
export type { IndexedDBConfig } from './local';

// React exports
export { useMindCache } from './react';
export type { UseMindCacheResult } from './react';
