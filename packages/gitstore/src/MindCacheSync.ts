/**
 * MindCacheSync - Integration helper for MindCache and GitStore
 *
 * Provides easy synchronization between MindCache instances and Git repositories.
 */

import type { GitStore } from './GitStore';
import type { CommitResult, WriteOptions } from './types';

// MindCache interface (to avoid hard dependency)
interface IMindCache {
    toMarkdown(): string;
    fromMarkdown(markdown: string, merge?: boolean): void;
}

/**
 * Options for the MindCacheSync helper
 */
export interface MindCacheSyncOptions {
    /** File path for the MindCache markdown file (default: 'mindcache.md') */
    filePath?: string;
    /** Name of the instance (used in commit messages) */
    instanceName?: string;
}

/**
 * MindCacheSync provides synchronization between a MindCache instance and GitStore.
 *
 * @example
 * ```typescript
 * const gitStore = new GitStore({...});
 * const mindcache = new MindCache({...});
 *
 * const sync = new MindCacheSync(gitStore, mindcache, {
 *   filePath: 'my-instance/mindcache.md',
 *   instanceName: 'My Instance'
 * });
 *
 * // Save to Git
 * await sync.save({ message: 'Update notes' });
 *
 * // Load from Git
 * await sync.load({ merge: true });
 * ```
 */
export class MindCacheSync {
  private gitStore: GitStore;
  private mindcache: IMindCache;
  private options: Required<MindCacheSyncOptions>;
  private autoSyncDebounce: ReturnType<typeof setTimeout> | null = null;
  private autoSyncEnabled = false;

  constructor(
    gitStore: GitStore,
    mindcache: IMindCache,
    options?: MindCacheSyncOptions
  ) {
    this.gitStore = gitStore;
    this.mindcache = mindcache;
    this.options = {
      filePath: options?.filePath ?? 'mindcache.md',
      instanceName: options?.instanceName ?? 'MindCache'
    };
  }

  /**
     * Save the current MindCache state to Git
     *
     * @param options - Optional commit message and branch override
     * @returns Commit result
     */
  async save(options?: WriteOptions): Promise<CommitResult> {
    const markdown = this.mindcache.toMarkdown();
    const message = options?.message ?? `Update ${this.options.instanceName}`;

    return this.gitStore.writeFile(this.options.filePath, markdown, {
      ...options,
      message
    });
  }

  /**
     * Load MindCache state from Git
     *
     * @param options - Load options
     * @param options.merge - If true, merge with existing state instead of replacing
     */
  async load(options?: { merge?: boolean }): Promise<void> {
    try {
      const markdown = await this.gitStore.readFile(this.options.filePath);
      this.mindcache.fromMarkdown(markdown, options?.merge ?? false);
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        // File doesn't exist yet, nothing to load
        return;
      }
      throw error;
    }
  }

  /**
     * Check if the MindCache file exists in Git
     */
  async exists(): Promise<boolean> {
    return this.gitStore.exists(this.options.filePath);
  }

  /**
     * Get the SHA of the current file (useful for detecting changes)
     */
  async getSha(): Promise<string | null> {
    return this.gitStore.getFileSha(this.options.filePath);
  }

  /**
     * Get commit history for the MindCache file
     *
     * @param limit - Maximum number of commits to return
     */
  async getHistory(limit?: number) {
    return this.gitStore.getCommitHistory(this.options.filePath, limit);
  }

  /**
     * Enable auto-sync: automatically save to Git when MindCache changes
     *
     * Note: This requires the MindCache instance to support subscriptions.
     * The save is debounced to avoid excessive commits.
     *
     * @param debounceMs - Debounce delay in milliseconds (default: 5000)
     */
  enableAutoSync(debounceMs: number = 5000): void {
    if (this.autoSyncEnabled) {
      return;
    }
    this.autoSyncEnabled = true;

    // Note: The caller should set up the subscription like:
    // mindcache.subscribeToAll(() => sync.triggerAutoSync());
    console.log(`[MindCacheSync] Auto-sync enabled with ${debounceMs}ms debounce`);
  }

  /**
     * Trigger an auto-sync save (debounced)
     * Call this from a MindCache subscription listener
     */
  triggerAutoSync(debounceMs: number = 5000): void {
    if (!this.autoSyncEnabled) {
      return;
    }

    if (this.autoSyncDebounce) {
      clearTimeout(this.autoSyncDebounce);
    }

    this.autoSyncDebounce = setTimeout(async () => {
      try {
        await this.save({ message: `Auto-save ${this.options.instanceName}` });
      } catch (error) {
        console.error('[MindCacheSync] Auto-sync failed:', error);
      }
    }, debounceMs);
  }

  /**
     * Disable auto-sync
     */
  disableAutoSync(): void {
    this.autoSyncEnabled = false;
    if (this.autoSyncDebounce) {
      clearTimeout(this.autoSyncDebounce);
      this.autoSyncDebounce = null;
    }
  }

  /**
     * Check if auto-sync is enabled
     */
  get isAutoSyncEnabled(): boolean {
    return this.autoSyncEnabled;
  }

  /**
     * Get the configured file path
     */
  get filePath(): string {
    return this.options.filePath;
  }

  /**
     * Get the configured instance name
     */
  get instanceName(): string {
    return this.options.instanceName;
  }
}
