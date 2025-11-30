/**
 * WebSocket protocol messages between client and server
 */

import type { KeyAttributes, KeyEntry } from './types';

// =============================================================================
// Client → Server Messages
// =============================================================================

export interface AuthMessage {
  type: 'auth';
  apiKey: string;
}

export interface SetKeyMessage {
  type: 'set';
  key: string;
  value: unknown;
  attributes: KeyAttributes;
  timestamp: number;
}

export interface DeleteKeyMessage {
  type: 'delete';
  key: string;
  timestamp: number;
}

export interface ClearMessage {
  type: 'clear';
  timestamp: number;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = 
  | AuthMessage 
  | SetKeyMessage 
  | DeleteKeyMessage 
  | ClearMessage
  | PingMessage;

// =============================================================================
// Server → Client Messages
// =============================================================================

export interface AuthSuccessMessage {
  type: 'auth_success';
  instanceId: string;
  userId: string;
  permission: 'read' | 'write' | 'admin';
}

export interface AuthErrorMessage {
  type: 'auth_error';
  error: string;
  code: 'INVALID_KEY' | 'EXPIRED' | 'NO_ACCESS' | 'INSTANCE_NOT_FOUND';
}

export interface SyncMessage {
  type: 'sync';
  data: Record<string, KeyEntry>;
  instanceId: string;
}

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

export interface ClearedMessage {
  type: 'cleared';
  clearedBy: string;
  timestamp: number;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
  code: string;
}

export interface PongMessage {
  type: 'pong';
}

export type ServerMessage = 
  | AuthSuccessMessage 
  | AuthErrorMessage 
  | SyncMessage 
  | KeyUpdatedMessage 
  | KeyDeletedMessage 
  | ClearedMessage
  | ErrorMessage
  | PongMessage;

