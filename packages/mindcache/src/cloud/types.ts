import type { KeyAttributes } from '../core/types';

/**
 * Configuration for connecting to MindCache Cloud
 */
export interface CloudConfig {
  /** The project ID from mindcache.io */
  projectId: string;
  /** The instance ID to connect to */
  instanceId: string;
  /** API key for authentication (server-to-server only) */
  apiKey?: string;
  /** Base URL for the API (optional, defaults to production) */
  baseUrl?: string;
  /** Token provider function for automatic token refresh */
  tokenProvider?: () => Promise<string>;
}

/**
 * Operations that can be sent to the cloud
 */
export type OperationType = 'set' | 'delete' | 'clear';

export interface SetOperation {
  type: 'set';
  key: string;
  value: unknown;
  attributes: KeyAttributes;
  timestamp: number;
}

export interface DeleteOperation {
  type: 'delete';
  key: string;
  timestamp: number;
}

export interface ClearOperation {
  type: 'clear';
  timestamp: number;
}

export type Operation = SetOperation | DeleteOperation | ClearOperation;

/**
 * WebSocket message types
 */
export interface AuthMessage {
  type: 'auth';
  apiKey: string;
}

export interface AuthSuccessMessage {
  type: 'auth_success';
  instanceId: string;
}

export interface AuthErrorMessage {
  type: 'auth_error';
  error: string;
}

export interface SyncMessage {
  type: 'sync';
  data: Record<string, { value: unknown; attributes: KeyAttributes }>;
}

export interface SetMessage {
  type: 'set';
  key: string;
  value: unknown;
  attributes: KeyAttributes;
}

export interface DeleteMessage {
  type: 'delete';
  key: string;
}

export interface ClearMessage {
  type: 'clear';
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

// Server-specific message types
export interface KeyUpdatedMessage {
  type: 'key_updated';
  key: string;
  value: unknown;
  attributes: KeyAttributes;
  updatedBy: string;
  timestamp: number;
}

export interface KeyDeletedMessage {
  type: 'key_deleted';
  key: string;
  deletedBy: string;
  timestamp: number;
}

export interface ClearedByMessage {
  type: 'cleared';
  clearedBy: string;
  timestamp: number;
}

export type IncomingMessage =
  | AuthSuccessMessage
  | AuthErrorMessage
  | SyncMessage
  | SetMessage
  | DeleteMessage
  | ClearMessage
  | ErrorMessage
  | KeyUpdatedMessage
  | KeyDeletedMessage
  | ClearedByMessage;

export type OutgoingMessage =
  | AuthMessage
  | SetOperation
  | DeleteOperation
  | ClearOperation;

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Event types emitted by CloudAdapter
 */
export interface CloudAdapterEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  synced: () => void;
  network_online: () => void;
  network_offline: () => void;
}

