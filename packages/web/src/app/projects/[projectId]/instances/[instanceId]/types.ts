export interface Instance {
  id: string;
  name: string;
  is_readonly: number;
}

export interface KeyEntry {
  value: unknown;
  attributes: {
    readonly: boolean;
    visible: boolean;
    hardcoded: boolean;
    template: boolean;
    type: 'text' | 'image' | 'file' | 'json';
    contentType?: string;
    tags?: string[];
    systemTags?: string[]; // SystemPrompt, LLMWrite, ApplyTemplate, protected, etc.
    zIndex?: number;
  };
  updatedAt?: number;
}

export type SyncData = Record<string, KeyEntry>;

export type Permission = 'read' | 'write' | 'admin' | 'system';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
export const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
