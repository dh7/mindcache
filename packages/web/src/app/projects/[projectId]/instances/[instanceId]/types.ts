import type { STMEntry as KeyEntry, KeyAttributes as SDKKeyAttributes, SystemTag } from 'mindcache';

export interface Instance {
  id: string;
  name: string;
  is_readonly: number;
}

// Re-export from SDK for consistency
export type { KeyEntry, SystemTag };
export type KeyAttributes = SDKKeyAttributes;

export type SyncData = Record<string, KeyEntry>;

export type Permission = 'read' | 'write' | 'admin' | 'system';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
export const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
