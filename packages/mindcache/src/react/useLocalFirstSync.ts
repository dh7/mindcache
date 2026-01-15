'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MindCache } from '../core/MindCache';

/**
 * GitStore sync configuration
 */
export interface GitStoreSyncConfig {
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** File path in repo (default: 'mindcache.md') */
  path?: string;
  /** GitHub token or token provider */
  token: string | (() => Promise<string>);
  /** Branch to sync to (default: 'main') */
  branch?: string;
}

/**
 * Server sync configuration
 */
export interface ServerSyncConfig {
  /** Server URL for sync endpoint */
  url: string;
  /** Optional auth token */
  authToken?: string;
}

/**
 * useLocalFirstSync options
 */
export interface UseLocalFirstSyncOptions {
  /** MindCache instance to sync */
  mindcache: MindCache | null;
  /** GitStore configuration */
  gitstore?: GitStoreSyncConfig;
  /** Optional server sync configuration */
  server?: ServerSyncConfig;
  /** Auto-sync interval in ms (0 = disabled, default: 0) */
  autoSyncInterval?: number;
  /** Debounce delay for auto-save in ms (default: 5000) */
  saveDebounceMs?: number;
  /** Load from remote on mount (default: true) */
  loadOnMount?: boolean;
  /** Merge remote data with local (default: true) */
  mergeOnLoad?: boolean;
}

/**
 * Sync status
 */
export type SyncStatus = 'idle' | 'loading' | 'saving' | 'syncing' | 'error';

/**
 * useLocalFirstSync return value
 */
export interface UseLocalFirstSyncReturn {
  /** Current sync status */
  status: SyncStatus;
  /** Last error */
  error: Error | null;
  /** Last successful sync timestamp */
  lastSyncAt: Date | null;
  /** Whether there are unsaved local changes */
  hasLocalChanges: boolean;
  /** Load data from remote (GitStore or server) */
  load: () => Promise<void>;
  /** Save current state to remote */
  save: (message?: string) => Promise<void>;
  /** Full sync: load then save if changes */
  sync: () => Promise<void>;
  /** Mark local changes as saved (for manual tracking) */
  markSaved: () => void;
}

/**
 * useLocalFirstSync - Hook for local-first sync with GitStore
 *
 * Provides automatic syncing between local MindCache and GitHub via GitStore.
 * Data is always available locally via IndexedDB, with async GitHub backup.
 *
 * @example
 * ```tsx
 * const { status, save, load, hasLocalChanges } = useLocalFirstSync({
 *   mindcache,
 *   gitstore: {
 *     owner: 'myuser',
 *     repo: 'my-data',
 *     token: process.env.GITHUB_TOKEN,
 *   },
 *   autoSyncInterval: 60000, // Sync every minute
 * });
 * ```
 */
export function useLocalFirstSync(options: UseLocalFirstSyncOptions): UseLocalFirstSyncReturn {
  const {
    mindcache,
    gitstore,
    server,
    autoSyncInterval = 0,
    saveDebounceMs = 5000,
    loadOnMount = true,
    mergeOnLoad = true
  } = options;

  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Get token from provider or direct value
  const getToken = useCallback(async (): Promise<string> => {
    if (!gitstore) {
      throw new Error('GitStore not configured');
    }
    return typeof gitstore.token === 'function'
      ? await gitstore.token()
      : gitstore.token;
  }, [gitstore]);

  // Load from remote
  const load = useCallback(async () => {
    if (!mindcache) {
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      if (gitstore) {
        // Dynamic import (using Function to avoid TypeScript module resolution)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let gitStoreModule: any;
        try {
          gitStoreModule = await (Function('return import("@mindcache/gitstore")')() as Promise<any>);
        } catch {
          throw new Error('@mindcache/gitstore is not installed. Run: npm install @mindcache/gitstore');
        }

        const { GitStore, MindCacheSync } = gitStoreModule;
        const token = await getToken();

        const store = new GitStore({
          owner: gitstore.owner,
          repo: gitstore.repo,
          branch: gitstore.branch,
          tokenProvider: async () => token
        });

        const sync = new MindCacheSync(store, mindcache, {
          filePath: gitstore.path || 'mindcache.md'
        });

        await sync.load({ merge: mergeOnLoad });
      } else if (server) {
        // Server sync
        const response = await fetch(server.url, {
          headers: server.authToken
            ? { Authorization: `Bearer ${server.authToken}` }
            : {}
        });

        if (response.ok) {
          const markdown = await response.text();
          mindcache.fromMarkdown(markdown, mergeOnLoad);
        }
      }

      if (mountedRef.current) {
        setLastSyncAt(new Date());
        setStatus('idle');
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
      }
      throw err;
    }
  }, [mindcache, gitstore, server, getToken, mergeOnLoad]);

  // Save to remote
  const save = useCallback(async (message?: string) => {
    if (!mindcache) {
      return;
    }

    setStatus('saving');
    setError(null);

    try {
      if (gitstore) {
        // Dynamic import (using Function to avoid TypeScript module resolution)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let gitStoreModule: any;
        try {
          gitStoreModule = await (Function('return import("@mindcache/gitstore")')() as Promise<any>);
        } catch {
          throw new Error('@mindcache/gitstore is not installed. Run: npm install @mindcache/gitstore');
        }

        const { GitStore, MindCacheSync } = gitStoreModule;
        const token = await getToken();

        const store = new GitStore({
          owner: gitstore.owner,
          repo: gitstore.repo,
          branch: gitstore.branch,
          tokenProvider: async () => token
        });

        const sync = new MindCacheSync(store, mindcache, {
          filePath: gitstore.path || 'mindcache.md'
        });

        await sync.save({ message: message || 'MindCache sync' });
      } else if (server) {
        await fetch(server.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            ...(server.authToken ? { Authorization: `Bearer ${server.authToken}` } : {})
          },
          body: mindcache.toMarkdown()
        });
      }

      if (mountedRef.current) {
        setLastSyncAt(new Date());
        setHasLocalChanges(false);
        setStatus('idle');
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
      }
      throw err;
    }
  }, [mindcache, gitstore, server, getToken]);

  // Full sync
  const sync = useCallback(async () => {
    setStatus('syncing');
    try {
      await load();
      if (hasLocalChanges) {
        await save();
      }
    } catch (err) {
      // Error already handled in load/save
    }
  }, [load, save, hasLocalChanges]);

  // Mark as saved
  const markSaved = useCallback(() => {
    setHasLocalChanges(false);
  }, []);

  // Subscribe to MindCache changes for auto-save
  useEffect(() => {
    if (!mindcache || !gitstore || saveDebounceMs <= 0) {
      return;
    }

    const unsubscribe = mindcache.subscribeToAll(() => {
      setHasLocalChanges(true);

      // Debounced auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        // eslint-disable-next-line no-console
        save('Auto-save').catch(console.error);
      }, saveDebounceMs);
    });

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mindcache, gitstore, saveDebounceMs, save]);

  // Auto-sync interval
  useEffect(() => {
    if (!mindcache || autoSyncInterval <= 0) {
      return;
    }

    syncIntervalRef.current = setInterval(() => {
      // eslint-disable-next-line no-console
      sync().catch(console.error);
    }, autoSyncInterval);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [mindcache, autoSyncInterval, sync]);

  // Load on mount
  useEffect(() => {
    if (loadOnMount && mindcache && (gitstore || server)) {
      // eslint-disable-next-line no-console
      load().catch(console.error);
    }
  }, [mindcache, gitstore, server, loadOnMount]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    status,
    error,
    lastSyncAt,
    hasLocalChanges,
    load,
    save,
    sync,
    markSaved
  };
}
