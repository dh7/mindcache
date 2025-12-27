'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { MindCache, STMEntry as KeyEntry, STM as SyncData } from 'mindcache';
import { Permission, API_URL } from '../types';

interface UseMindCacheOptions {
    instanceId: string;
    getToken: () => Promise<string | null>;
}

interface UseMindCacheReturn {
    // State
    keys: SyncData;
    connected: boolean;
    error: string | null;
    permission: Permission;
    mcRef: React.RefObject<MindCache | null>;

    // Actions
    sendMessage: (msg: {
        type: string;
        key?: string;
        value?: unknown;
        attributes?: KeyEntry['attributes'];
        timestamp?: number;
    }) => void;
    setError: (error: string | null) => void;
}

export function useMindCache({ instanceId, getToken }: UseMindCacheOptions): UseMindCacheReturn {
  const [keys, setKeys] = useState<SyncData>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission>('read');

  const mcRef = useRef<MindCache | null>(null);

  // Initialize MindCache SDK
  useEffect(() => {
    const initMindCache = async () => {
      if (mcRef.current) {
        return;
      }

      try {
        setError(null);
        const mc = new MindCache({
          cloud: {
            instanceId,
            baseUrl: API_URL,
            tokenProvider: async () => {
              const jwtToken = await getToken();
              const res = await fetch(`${API_URL}/api/ws-token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
                },
                body: JSON.stringify({ instanceId })
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to get token' }));
                setError(err.details || err.error || 'Failed to authenticate');
                throw new Error('Failed to get token');
              }
              const { token, permission: perm } = await res.json();
              setPermission(perm);
              return token;
            }
          }
        });

        // Subscribe to all changes
        mc.subscribeToAll(() => {
          setConnected(mc.connectionState === 'connected');
          if (mc.connectionState === 'error') {
            setError('Connection error');
          } else if (mc.connectionState === 'connected') {
            setError(null);
          }
          // Build keys from primitives (more stable API)
          const keyList = mc.keys().filter(k => !k.startsWith('$'));
          const entries: SyncData = {};
          for (const key of keyList) {
            const value = mc.get_value(key);
            const attributes = mc.get_attributes(key);
            if (attributes) {
              entries[key] = { value, attributes };
            }
          }
          setKeys(entries);
        });

        mcRef.current = mc;
        setConnected(true);
      } catch (err) {
        console.error('Failed to initialize MindCache:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    };

    initMindCache();

    return () => {
      mcRef.current?.disconnect();
      mcRef.current = null;
    };
  }, [instanceId, getToken]);

  // Helper to send updates via MindCache SDK
  const sendMessage = useCallback((msg: {
        type: string;
        key?: string;
        value?: unknown;
        attributes?: KeyEntry['attributes'];
        timestamp?: number;
    }) => {
    if (!mcRef.current) {
      console.error('MindCache not initialized');
      return;
    }

    const currentKeys = mcRef.current.keys().reduce((acc, k) => {
      const value = mcRef.current!.get_value(k);
      const attributes = mcRef.current!.get_attributes(k);
      if (attributes) {
        acc[k] = { value, attributes };
      }
      return acc;
    }, {} as SyncData);

    switch (msg.type) {
      case 'set':
        if (msg.key && msg.attributes) {
          const existingEntry = currentKeys[msg.key];
          const isExistingDocument = existingEntry?.attributes?.type === 'document';

          if (msg.attributes.type === 'document' && !existingEntry) {
            mcRef.current.set_document(msg.key, String(msg.value ?? ''));
          } else if (isExistingDocument) {
            mcRef.current.set_attributes(msg.key, msg.attributes);
          } else {
            mcRef.current.set_value(msg.key, msg.value, msg.attributes);
          }
        }
        break;
      case 'delete':
        if (msg.key) {
          mcRef.current.delete_key(msg.key);
        }
        break;
      case 'clear':
        mcRef.current.clear();
        break;
    }
  }, []);

  return {
    keys,
    connected,
    error,
    permission,
    mcRef,
    sendMessage,
    setError
  };
}
