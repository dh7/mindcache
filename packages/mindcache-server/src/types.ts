import type { KeyAttributes } from 'mindcache/server';

export type TagMatchMode = 'all' | 'any';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
}

export interface MindCacheServerCoreOptions {
  /** Root folder that contains MindCache files */
  rootDir: string;
  /** File extensions to include (with leading dot) */
  includeExtensions?: string[];
  /** Enable filesystem watch mode */
  watch?: boolean;
  /** Fallback polling interval in milliseconds (0 disables polling) */
  pollIntervalMs?: number;
  /** Debounce delay for filesystem events in milliseconds */
  debounceMs?: number;
  /** Logger used by the server */
  logger?: Logger;
}

export interface MindCacheApiServerOptions {
  core: MindCacheServerCoreApi;
  host?: string;
  port?: number;
  authToken?: string;
  logger?: Logger;
}

export interface EntrySnapshot {
  rawKey: string;
  value: unknown;
  attributes: KeyAttributes;
  hash: string;
}

export interface FileSnapshot {
  fileId: string;
  absolutePath: string;
  mtimeMs: number;
  size: number;
  entries: Map<string, EntrySnapshot>;
}

export interface IndexedEntry {
  key: string;
  rawKey: string;
  fileId: string;
  value: unknown;
  attributes: KeyAttributes;
}

export interface FileMetadata {
  fileId: string;
  absolutePath: string;
  mtimeMs: number;
  size: number;
}

export interface ContextWindowQuery {
  tags?: string[];
  match?: TagMatchMode;
}

export interface ContextWindowResult {
  tags: string[];
  match: TagMatchMode;
  keys: string[];
  visibleKeys: string[];
  contextWindow: string;
}

export interface MindCacheServerStats {
  rootDir: string;
  files: number;
  keys: number;
  tags: number;
  watchEnabled: boolean;
  started: boolean;
  lastReconcileAt: string | null;
}

export interface MindCacheServerCoreApi {
  getStats(): MindCacheServerStats;
  getAllTags(): string[];
  getTagsForKey(canonicalKey: string): string[];
  findKeysByTags(tags: string[], match?: TagMatchMode): string[];
  listEntries(query?: ContextWindowQuery): IndexedEntry[];
  getContextWindow(query?: ContextWindowQuery): ContextWindowResult;
  reconcile(reason?: string): Promise<void>;
}
