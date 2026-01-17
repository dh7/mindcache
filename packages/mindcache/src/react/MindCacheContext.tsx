'use client';

import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { createOpenAI } from '@ai-sdk/openai';
import { MindCache, type MindCacheOptions } from '../core/MindCache';

/** Supported AI providers */
export type AIProvider = 'openai' | 'anthropic' | 'custom';

/**
 * Create a model from provider config
 */
function createModel(provider: AIProvider, model: string, apiKey: string) {
  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }
    case 'anthropic':
      throw new Error('Anthropic provider not yet implemented. Use modelProvider for custom providers.');
    default:
      throw new Error(`Unknown provider: ${provider}. Use modelProvider for custom providers.`);
  }
}

/**
 * Configuration for local-first sync
 */
export interface LocalFirstSyncConfig {
  /** Optional server URL for real-time sync when online */
  serverUrl?: string;
  /** GitStore configuration for GitHub backup */
  gitstore?: {
    owner: string;
    repo: string;
    path?: string;
    /** Token provider function or direct token */
    token: string | (() => Promise<string>);
  };
  /** Auto-sync interval in ms (default: 30000 = 30s) */
  autoSyncInterval?: number;
  /** Debounce delay for saves in ms (default: 2000) */
  saveDebounceMs?: number;
}

/**
 * AI configuration for client-side chat
 */
export interface AIConfig {
  /**
   * AI provider: 'openai' | 'anthropic' | 'custom'
   * If using 'custom', you must provide modelProvider
   * @default 'openai'
   */
  provider?: AIProvider;
  /**
   * Model name (e.g., 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet')
   * @default 'gpt-4o'
   */
  model?: string;
  /** API key - stored in localStorage if keyStorage is 'localStorage' */
  apiKey?: string;
  /** Where to store the API key: 'localStorage' | 'memory' | 'prompt' */
  keyStorage?: 'localStorage' | 'memory' | 'prompt';
  /** localStorage key for API key (default: 'ai_api_key') */
  storageKey?: string;
  /**
   * Custom model provider function (advanced usage)
   * Use this for providers not built-in or custom configurations
   * @example
   * ```ts
   * import { createOpenAI } from '@ai-sdk/openai';
   * modelProvider: (apiKey) => createOpenAI({ apiKey, baseURL: '...' })('gpt-4o')
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelProvider?: (apiKey: string) => any;
}

/**
 * MindCache Provider configuration
 */
export interface MindCacheProviderConfig {
  /** MindCache options (IndexedDB config, etc.) */
  mindcache?: MindCacheOptions;
  /** Local-first sync configuration */
  sync?: LocalFirstSyncConfig;
  /** AI configuration for client-side chat */
  ai?: AIConfig;
  /** Children components */
  children: ReactNode;
}

/**
 * MindCache context value
 */
export interface MindCacheContextValue {
  /** The MindCache instance */
  mindcache: MindCache | null;
  /** Whether MindCache is loaded and ready */
  isLoaded: boolean;
  /** Any error during initialization */
  error: Error | null;
  /** AI configuration */
  aiConfig: AIConfig;
  /** Sync configuration */
  syncConfig: LocalFirstSyncConfig | undefined;
  /** Get the API key (from storage or prompt) */
  getApiKey: () => string | null;
  /** Set the API key */
  setApiKey: (key: string) => void;
  /** Whether API key is configured */
  hasApiKey: boolean;
  /** Get the AI model (uses API key from storage) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getModel: () => any;
  /** Trigger a manual sync to GitStore */
  syncToGitStore: () => Promise<void>;
  /** Last sync timestamp */
  lastSyncAt: Date | null;
  /** Whether currently syncing */
  isSyncing: boolean;
}

const MindCacheContext = createContext<MindCacheContextValue | null>(null);

/**
 * Hook to access MindCache context
 */
export function useMindCacheContext(): MindCacheContextValue {
  const context = useContext(MindCacheContext);
  if (!context) {
    throw new Error('useMindCacheContext must be used within a MindCacheProvider');
  }
  return context;
}

/**
 * MindCacheProvider - Context provider for local-first MindCache apps
 *
 * @example
 * ```tsx
 * <MindCacheProvider
 *   mindcache={{ indexedDB: { dbName: 'my-app' } }}
 *   ai={{ keyStorage: 'localStorage' }}
 *   sync={{ gitstore: { owner: 'me', repo: 'data', token: 'ghp_...' } }}
 * >
 *   <App />
 * </MindCacheProvider>
 * ```
 */
export function MindCacheProvider({
  mindcache: mcOptions,
  sync: syncConfig,
  ai: aiConfig = {},
  children
}: MindCacheProviderConfig) {
  const [mindcache, setMindcache] = useState<MindCache | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const initRef = useRef(false);

  // Default AI config
  const resolvedAiConfig: AIConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    keyStorage: 'localStorage',
    storageKey: 'ai_api_key',
    ...aiConfig
  };

  // Initialize MindCache
  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    const init = async () => {
      try {
        // Default to IndexedDB if no options provided
        const options: MindCacheOptions = mcOptions || {
          indexedDB: {
            dbName: 'mindcache_local_first',
            storeName: 'mindcache_store',
            debounceMs: 1000
          }
        };

        const mc = new MindCache(options);
        await mc.waitForSync();
        setMindcache(mc);
        setIsLoaded(true);

        // Check for existing API key
        if (resolvedAiConfig.keyStorage === 'localStorage' && typeof window !== 'undefined') {
          const stored = localStorage.getItem(resolvedAiConfig.storageKey || 'openai_api_key');
          setHasApiKey(!!stored);
        } else if (resolvedAiConfig.apiKey) {
          setHasApiKey(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoaded(true);
      }
    };

    init();

    return () => {
      if (mindcache) {
        mindcache.disconnect();
      }
    };
  }, []);

  // Get API key from configured storage
  const getApiKey = (): string | null => {
    if (resolvedAiConfig.apiKey) {
      return resolvedAiConfig.apiKey;
    }
    if (resolvedAiConfig.keyStorage === 'localStorage' && typeof window !== 'undefined') {
      return localStorage.getItem(resolvedAiConfig.storageKey || 'openai_api_key');
    }
    return null;
  };

  // Set API key
  const setApiKey = (key: string) => {
    if (resolvedAiConfig.keyStorage === 'localStorage' && typeof window !== 'undefined') {
      localStorage.setItem(resolvedAiConfig.storageKey || 'openai_api_key', key);
      setHasApiKey(true);
    }
  };

  // Get AI model
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getModel = (): any => {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('API key not configured. Call setApiKey() first or configure ai.apiKey.');
    }

    // Use custom modelProvider if provided
    if (resolvedAiConfig.modelProvider) {
      return resolvedAiConfig.modelProvider(apiKey);
    }

    // Use built-in provider
    const provider = resolvedAiConfig.provider || 'openai';
    const model = resolvedAiConfig.model || 'gpt-4o';
    return createModel(provider, model, apiKey);
  };

  // Sync to GitStore
  const syncToGitStore = async () => {
    if (!mindcache || !syncConfig?.gitstore) {
      return;
    }

    setIsSyncing(true);
    try {
      // Dynamic import to avoid bundling gitstore if not used
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let gitStoreModule: any;
      try {
        gitStoreModule = await (Function('return import("@mindcache/gitstore")')() as Promise<any>);
      } catch {
        throw new Error('@mindcache/gitstore is not installed. Run: npm install @mindcache/gitstore');
      }

      const { GitStore, MindCacheSync } = gitStoreModule;

      const token = typeof syncConfig.gitstore.token === 'function'
        ? await syncConfig.gitstore.token()
        : syncConfig.gitstore.token;

      const gitStore = new GitStore({
        owner: syncConfig.gitstore.owner,
        repo: syncConfig.gitstore.repo,
        tokenProvider: async () => token
      });

      const sync = new MindCacheSync(gitStore, mindcache, {
        filePath: syncConfig.gitstore.path || 'mindcache.md'
      });

      await sync.save({ message: 'Auto-sync from MindCache' });
      setLastSyncAt(new Date());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MindCacheProvider] Sync error:', err);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  const value: MindCacheContextValue = {
    mindcache,
    isLoaded,
    error,
    aiConfig: resolvedAiConfig,
    syncConfig,
    getApiKey,
    setApiKey,
    hasApiKey,
    getModel,
    syncToGitStore,
    lastSyncAt,
    isSyncing
  };

  return (
    <MindCacheContext.Provider value={value}>
      {children}
    </MindCacheContext.Provider>
  );
}
