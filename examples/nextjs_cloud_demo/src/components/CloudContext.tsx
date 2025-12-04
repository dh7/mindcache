'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';

interface CloudContextType {
  mindcache: MindCache;
  cloudAdapter: CloudAdapter | null;
  connectionState: ConnectionState;
  isConfigured: boolean;
  connect: () => void;
  disconnect: () => void;
  stmVersion: number;
  triggerRefresh: () => void;
}

const CloudContext = createContext<CloudContextType | null>(null);

interface CloudProviderProps {
  children: React.ReactNode;
  apiKey?: string;
  instanceId?: string;
  projectId?: string;
}

export function CloudProvider({ children, apiKey, instanceId, projectId }: CloudProviderProps) {
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [stmVersion, setStmVersion] = useState(0);
  const [isConfigured, setIsConfigured] = useState(false);

  // Initialize cloud adapter
  useEffect(() => {
    if (!apiKey || !instanceId || !projectId) {
      console.log('☁️ Cloud not configured - missing credentials');
      setIsConfigured(false);
      return;
    }

    setIsConfigured(true);
    console.log('☁️ Initializing CloudAdapter...');

    const adapter = new CloudAdapter({
      apiKey,
      instanceId,
      projectId,
    });

    // Set up event listeners
    adapter.on('connected', () => {
      console.log('☁️ Connected to MindCache Cloud');
      setConnectionState('connected');
    });

    adapter.on('disconnected', () => {
      console.log('☁️ Disconnected from MindCache Cloud');
      setConnectionState('disconnected');
    });

    adapter.on('error', (error) => {
      console.error('☁️ Cloud error:', error);
      setConnectionState('error');
    });

    adapter.on('synced', () => {
      console.log('☁️ Initial sync completed');
      setStmVersion(v => v + 1);
    });

    // Attach to MindCache instance
    adapter.attach(mindcacheRef.current);
    cloudAdapterRef.current = adapter;

    // Connect
    adapter.connect();
    setConnectionState('connecting');

    return () => {
      adapter.disconnect();
      adapter.detach();
    };
  }, [apiKey, instanceId, projectId]);

  // Subscribe to MindCache changes
  useEffect(() => {
    const handleChange = () => {
      setStmVersion(v => v + 1);
    };

    mindcacheRef.current.subscribeToAll(handleChange);
    return () => mindcacheRef.current.unsubscribeFromAll(handleChange);
  }, []);

  const connect = useCallback(() => {
    if (cloudAdapterRef.current && connectionState === 'disconnected') {
      cloudAdapterRef.current.connect();
      setConnectionState('connecting');
    }
  }, [connectionState]);

  const disconnect = useCallback(() => {
    if (cloudAdapterRef.current) {
      cloudAdapterRef.current.disconnect();
    }
  }, []);

  const triggerRefresh = useCallback(() => {
    setStmVersion(v => v + 1);
  }, []);

  return (
    <CloudContext.Provider
      value={{
        mindcache: mindcacheRef.current,
        cloudAdapter: cloudAdapterRef.current,
        connectionState,
        isConfigured,
        connect,
        disconnect,
        stmVersion,
        triggerRefresh,
      }}
    >
      {children}
    </CloudContext.Provider>
  );
}

export function useCloud() {
  const context = useContext(CloudContext);
  if (!context) {
    throw new Error('useCloud must be used within a CloudProvider');
  }
  return context;
}

