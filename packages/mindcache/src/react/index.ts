// Core hooks
export { useMindCache } from './useMindCache';
export type { UseMindCacheResult } from './useMindCache';
export { useMindCacheDocument } from './useMindCacheDocument';
export type { UseMindCacheDocumentResult } from './useMindCacheDocument';

// Local-first components and hooks
export { MindCacheProvider, useMindCacheContext } from './MindCacheContext';
export type {
  MindCacheProviderConfig,
  MindCacheContextValue,
  LocalFirstSyncConfig,
  AIConfig,
  AIProvider
} from './MindCacheContext';

export { MindCacheChat } from './MindCacheChat';
export type {
  MindCacheChatProps,
  ChatTheme
} from './MindCacheChat';

export { useClientChat } from './useClientChat';
export type {
  UseClientChatOptions,
  UseClientChatReturn,
  ChatMessage,
  ChatStatus,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart
} from './useClientChat';

export { useLocalFirstSync } from './useLocalFirstSync';
export type {
  UseLocalFirstSyncOptions,
  UseLocalFirstSyncReturn,
  GitStoreSyncConfig,
  ServerSyncConfig,
  SyncStatus
} from './useLocalFirstSync';
