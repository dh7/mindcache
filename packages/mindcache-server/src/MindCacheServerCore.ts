import { promises as fs, watch as fsWatch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import { MindCache } from 'mindcache/server';

import {
  normalizeExtensions,
  parseMindCacheFile,
  readFileText,
  toCanonicalKey,
  toFileId
} from './fileUtils';
import type {
  ContextWindowQuery,
  ContextWindowResult,
  EntrySnapshot,
  FileMetadata,
  FileSnapshot,
  IndexedEntry,
  Logger,
  MindCacheServerCoreApi,
  MindCacheServerCoreOptions,
  MindCacheServerStats,
  TagMatchMode
} from './types';

const DEFAULT_EXTENSIONS = ['.md', '.markdown', '.mindcache', '.json'];
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_DEBOUNCE_MS = 200;

const defaultLogger: Logger = {
  info: (message: string) => {
    // eslint-disable-next-line no-console
    console.log(message);
  },
  warn: (message: string) => {
    // eslint-disable-next-line no-console
    console.warn(message);
  },
  error: (message: string) => {
    // eslint-disable-next-line no-console
    console.error(message);
  },
  debug: (message: string) => {
    // eslint-disable-next-line no-console
    console.debug(message);
  }
};

export class MindCacheServerCore implements MindCacheServerCoreApi {
  private readonly rootDir: string;
  private readonly includeExtensions: Set<string>;
  private readonly watchEnabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly debounceMs: number;
  private readonly logger: Logger;

  private readonly aggregate = new MindCache({ accessLevel: 'admin' });

  private fileSnapshots = new Map<string, FileSnapshot>();
  private fileMetadata = new Map<string, FileMetadata>();
  private tagIndex = new Map<string, Set<string>>();
  private rawKeyOwners = new Map<string, Set<string>>();
  private canonicalKeySources = new Map<string, { fileId: string; rawKey: string }>();

  private watcher: FSWatcher | null = null;
  private directoryWatchers = new Map<string, FSWatcher>();
  private usingRecursiveWatcher = false;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  private started = false;
  private reconcileInFlight = false;
  private reconcileQueued = false;
  private lastReconcileAt: Date | null = null;

  constructor(options: MindCacheServerCoreOptions) {
    if (!options.rootDir) {
      throw new Error('rootDir is required');
    }

    this.rootDir = path.resolve(options.rootDir);
    this.includeExtensions = normalizeExtensions(options.includeExtensions || DEFAULT_EXTENSIONS);
    this.watchEnabled = options.watch ?? true;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.logger = options.logger || defaultLogger;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await fs.mkdir(this.rootDir, { recursive: true });
    await this.reconcile('startup');

    if (this.watchEnabled) {
      await this.startWatchers();
    }

    if (this.pollIntervalMs > 0) {
      this.pollTimer = setInterval(() => {
        this.scheduleReconcile('poll');
      }, this.pollIntervalMs);
      this.pollTimer.unref();
    }

    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const watcher of this.directoryWatchers.values()) {
      watcher.close();
    }
    this.directoryWatchers.clear();

    this.started = false;
  }

  get mindcache(): MindCache {
    return this.aggregate;
  }

  get rootPath(): string {
    return this.rootDir;
  }

  getAllTags(): string[] {
    return Array.from(this.tagIndex.keys()).sort((a, b) => a.localeCompare(b));
  }

  getTagsForKey(canonicalKey: string): string[] {
    return this.aggregate.getTags(canonicalKey).sort((a, b) => a.localeCompare(b));
  }

  getContextWindow(query: ContextWindowQuery = {}): ContextWindowResult {
    const tags = this.normalizeTags(query.tags || []);
    const match = query.match || 'all';
    const keys = this.findKeysByTags(tags, match);
    const scopedCache = new MindCache({ accessLevel: 'admin' });

    for (const key of keys) {
      const attributes = this.aggregate.get_attributes(key);
      if (!attributes) {
        continue;
      }
      const value = this.aggregate.get_value(key);
      scopedCache.set_value(key, value, attributes);
    }

    const visibleKeys = keys.filter(key => {
      const attributes = this.aggregate.get_attributes(key);
      return Boolean(
        attributes?.systemTags.includes('SystemPrompt') ||
        attributes?.systemTags.includes('LLMRead')
      );
    });

    return {
      tags,
      match,
      keys,
      visibleKeys,
      contextWindow: scopedCache.get_system_prompt()
    };
  }

  findKeysByTags(tags: string[], match: TagMatchMode = 'all'): string[] {
    const normalizedTags = this.normalizeTags(tags);

    if (normalizedTags.length === 0) {
      return this.aggregate.keys().sort((a, b) => a.localeCompare(b));
    }

    if (match === 'any') {
      const union = new Set<string>();
      for (const tag of normalizedTags) {
        const keys = this.tagIndex.get(tag);
        if (!keys) {
          continue;
        }
        for (const key of keys) {
          union.add(key);
        }
      }
      return Array.from(union).sort((a, b) => a.localeCompare(b));
    }

    const sets: Set<string>[] = [];
    for (const tag of normalizedTags) {
      const keys = this.tagIndex.get(tag);
      if (!keys) {
        return [];
      }
      sets.push(keys);
    }

    sets.sort((a, b) => a.size - b.size);
    const [first, ...rest] = sets;
    const intersection = new Set(first);

    for (const set of rest) {
      for (const key of intersection) {
        if (!set.has(key)) {
          intersection.delete(key);
        }
      }
      if (intersection.size === 0) {
        return [];
      }
    }

    return Array.from(intersection).sort((a, b) => a.localeCompare(b));
  }

  listEntries(query: ContextWindowQuery = {}): IndexedEntry[] {
    const tags = this.normalizeTags(query.tags || []);
    const match = query.match || 'all';
    const keys = this.findKeysByTags(tags, match);
    const entries: IndexedEntry[] = [];

    for (const key of keys) {
      const entry = this.getEntry(key);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  getEntry(canonicalKey: string): IndexedEntry | undefined {
    const source = this.canonicalKeySources.get(canonicalKey);
    if (!source) {
      return undefined;
    }

    const attributes = this.aggregate.get_attributes(canonicalKey);
    if (!attributes) {
      return undefined;
    }

    return {
      key: canonicalKey,
      rawKey: source.rawKey,
      fileId: source.fileId,
      value: this.aggregate.get_value(canonicalKey),
      attributes
    };
  }

  getStats(): MindCacheServerStats {
    return {
      rootDir: this.rootDir,
      files: this.fileSnapshots.size,
      keys: this.aggregate.size(),
      tags: this.tagIndex.size,
      watchEnabled: this.watchEnabled,
      started: this.started,
      lastReconcileAt: this.lastReconcileAt ? this.lastReconcileAt.toISOString() : null
    };
  }

  async reconcile(reason = 'manual'): Promise<void> {
    if (this.reconcileInFlight) {
      this.reconcileQueued = true;
      return;
    }

    this.reconcileInFlight = true;

    try {
      const discoveredFiles = await this.scanMindCacheFiles();
      const nextMetadata = new Map<string, FileMetadata>();

      for (const [fileId, metadata] of discoveredFiles) {
        const previousMetadata = this.fileMetadata.get(fileId);
        const changed = !previousMetadata ||
          previousMetadata.mtimeMs !== metadata.mtimeMs ||
          previousMetadata.size !== metadata.size ||
          previousMetadata.absolutePath !== metadata.absolutePath;

        if (!changed) {
          if (previousMetadata) {
            nextMetadata.set(fileId, previousMetadata);
          }
          continue;
        }

        const loaded = await this.reloadFile(metadata);
        if (loaded) {
          nextMetadata.set(fileId, metadata);
        } else if (previousMetadata) {
          nextMetadata.set(fileId, previousMetadata);
        }
      }

      for (const fileId of this.fileMetadata.keys()) {
        if (!discoveredFiles.has(fileId)) {
          this.removeFile(fileId);
        }
      }

      this.fileMetadata = nextMetadata;
      this.lastReconcileAt = new Date();
      this.logger.debug?.(`[mindcache-server] Reconcile complete (${reason}). files=${this.fileSnapshots.size} keys=${this.aggregate.size()}`);

      if (this.watchEnabled && !this.usingRecursiveWatcher) {
        await this.syncDirectoryWatchers();
      }
    } catch (error) {
      this.logger.error(`[mindcache-server] Reconcile failed (${reason}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      this.reconcileInFlight = false;
      if (this.reconcileQueued) {
        this.reconcileQueued = false;
        void this.reconcile('queued');
      }
    }
  }

  private normalizeTags(tags: string[]): string[] {
    const unique = new Set<string>();
    for (const tag of tags) {
      const cleaned = tag.trim();
      if (cleaned) {
        unique.add(cleaned);
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }

  private async reloadFile(metadata: FileMetadata): Promise<boolean> {
    try {
      const content = await readFileText(metadata.absolutePath);
      const nextEntries = parseMindCacheFile(content, metadata.absolutePath);
      const previousSnapshot = this.fileSnapshots.get(metadata.fileId);
      const previousEntries = previousSnapshot?.entries || new Map<string, EntrySnapshot>();

      this.applyFileDiff(metadata.fileId, previousEntries, nextEntries);

      this.fileSnapshots.set(metadata.fileId, {
        fileId: metadata.fileId,
        absolutePath: metadata.absolutePath,
        mtimeMs: metadata.mtimeMs,
        size: metadata.size,
        entries: nextEntries
      });

      return true;
    } catch (error) {
      this.logger.warn(`[mindcache-server] Failed to load ${metadata.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private removeFile(fileId: string): void {
    const snapshot = this.fileSnapshots.get(fileId);
    if (!snapshot) {
      this.fileMetadata.delete(fileId);
      return;
    }

    for (const entry of snapshot.entries.values()) {
      this.removeEntry(fileId, entry);
    }

    this.fileSnapshots.delete(fileId);
    this.fileMetadata.delete(fileId);
  }

  private applyFileDiff(fileId: string, previous: Map<string, EntrySnapshot>, next: Map<string, EntrySnapshot>): void {
    for (const [rawKey, oldEntry] of previous) {
      if (!next.has(rawKey)) {
        this.removeEntry(fileId, oldEntry);
      }
    }

    for (const [rawKey, newEntry] of next) {
      const oldEntry = previous.get(rawKey);
      if (!oldEntry || oldEntry.hash !== newEntry.hash) {
        this.upsertEntry(fileId, newEntry, oldEntry);
      }
    }
  }

  private upsertEntry(fileId: string, entry: EntrySnapshot, previous?: EntrySnapshot): void {
    const canonicalKey = toCanonicalKey(fileId, entry.rawKey);

    this.aggregate.set_value(canonicalKey, entry.value, entry.attributes);
    this.canonicalKeySources.set(canonicalKey, { fileId, rawKey: entry.rawKey });

    this.updateTagIndex(
      canonicalKey,
      previous?.attributes.contentTags || [],
      entry.attributes.contentTags || []
    );

    if (!this.rawKeyOwners.has(entry.rawKey)) {
      this.rawKeyOwners.set(entry.rawKey, new Set());
    }
    this.rawKeyOwners.get(entry.rawKey)?.add(canonicalKey);
  }

  private removeEntry(fileId: string, entry: EntrySnapshot): void {
    const canonicalKey = toCanonicalKey(fileId, entry.rawKey);

    this.aggregate.delete(canonicalKey);
    this.canonicalKeySources.delete(canonicalKey);
    this.updateTagIndex(canonicalKey, entry.attributes.contentTags || [], []);

    const owners = this.rawKeyOwners.get(entry.rawKey);
    if (owners) {
      owners.delete(canonicalKey);
      if (owners.size === 0) {
        this.rawKeyOwners.delete(entry.rawKey);
      }
    }
  }

  private updateTagIndex(canonicalKey: string, oldTags: string[], newTags: string[]): void {
    const oldSet = new Set(oldTags);
    const newSet = new Set(newTags);

    for (const tag of oldSet) {
      if (newSet.has(tag)) {
        continue;
      }
      const keys = this.tagIndex.get(tag);
      if (!keys) {
        continue;
      }
      keys.delete(canonicalKey);
      if (keys.size === 0) {
        this.tagIndex.delete(tag);
      }
    }

    for (const tag of newSet) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)?.add(canonicalKey);
    }
  }

  private async scanMindCacheFiles(): Promise<Map<string, FileMetadata>> {
    const results = new Map<string, FileMetadata>();
    const stack: string[] = [this.rootDir];

    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) {
        continue;
      }

      let dirEntries;
      try {
        dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch (error) {
        this.logger.warn(`[mindcache-server] Failed to read directory ${currentDir}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      for (const entry of dirEntries) {
        if (entry.name.startsWith('.') && entry.isDirectory()) {
          continue;
        }

        const absolutePath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          stack.push(absolutePath);
          continue;
        }

        if (!entry.isFile() || !this.isSupportedFile(absolutePath)) {
          continue;
        }

        let stats;
        try {
          stats = await fs.stat(absolutePath);
        } catch {
          continue;
        }

        let fileId: string;
        try {
          fileId = toFileId(this.rootDir, absolutePath);
        } catch {
          continue;
        }

        results.set(fileId, {
          fileId,
          absolutePath,
          mtimeMs: stats.mtimeMs,
          size: stats.size
        });
      }
    }

    return results;
  }

  private isSupportedFile(absolutePath: string): boolean {
    const extension = path.extname(absolutePath).toLowerCase();
    return this.includeExtensions.has(extension);
  }

  private async startWatchers(): Promise<void> {
    try {
      this.watcher = fsWatch(this.rootDir, { recursive: true }, () => {
        this.scheduleReconcile('watch');
      });
      this.usingRecursiveWatcher = true;
      this.logger.debug?.('[mindcache-server] Started recursive watcher');
    } catch {
      this.usingRecursiveWatcher = false;
      await this.syncDirectoryWatchers();
      this.logger.debug?.('[mindcache-server] Recursive watch unavailable, using per-directory watchers');
    }
  }

  private async syncDirectoryWatchers(): Promise<void> {
    const directories = await this.scanDirectories();

    for (const directory of directories) {
      if (this.directoryWatchers.has(directory)) {
        continue;
      }

      try {
        const watcher = fsWatch(directory, () => {
          this.scheduleReconcile('watch');
        });
        this.directoryWatchers.set(directory, watcher);
      } catch (error) {
        this.logger.warn(`[mindcache-server] Failed to watch directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const [directory, watcher] of this.directoryWatchers) {
      if (directories.has(directory)) {
        continue;
      }
      watcher.close();
      this.directoryWatchers.delete(directory);
    }
  }

  private async scanDirectories(): Promise<Set<string>> {
    const directories = new Set<string>();
    const stack: string[] = [this.rootDir];

    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) {
        continue;
      }

      directories.add(currentDir);

      let dirEntries;
      try {
        dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of dirEntries) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (entry.name.startsWith('.')) {
          continue;
        }
        stack.push(path.join(currentDir, entry.name));
      }
    }

    return directories;
  }

  private scheduleReconcile(reason: string): void {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
    }

    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      void this.reconcile(reason);
    }, this.debounceMs);
  }
}
