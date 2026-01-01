/**
 * @mindcache/gitstore
 *
 * Git repository abstraction for MindCache - list files, read/write with commits.
 *
 * @example
 * ```typescript
 * import { GitStore, MindCacheSync } from '@mindcache/gitstore';
 *
 * const store = new GitStore({
 *   owner: 'myorg',
 *   repo: 'myrepo',
 *   tokenProvider: async () => process.env.GITHUB_TOKEN!
 * });
 *
 * // List files
 * const files = await store.listFiles();
 *
 * // Read a file
 * const content = await store.readFile('docs/readme.md');
 *
 * // Write a file
 * await store.writeFile('docs/new-file.md', '# New File');
 * ```
 */

// Core exports
export { GitStore } from './GitStore';
export { MindCacheSync } from './MindCacheSync';

// Type exports
export type {
  GitStoreConfig,
  FileEntry,
  CommitResult,
  Commit,
  ReadOptions,
  WriteOptions
} from './types';

export type { MindCacheSyncOptions } from './MindCacheSync';
