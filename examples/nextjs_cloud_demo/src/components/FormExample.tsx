'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';

// Get WebSocket URL from env (URL is not secret, only the API key is)
const WS_BASE_URL = (process.env.NEXT_PUBLIC_MINDCACHE_API_URL || 'http://localhost:8787')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

export default function FormExample() {
  const { getInstanceId } = useInstances();
  const instanceId = getInstanceId('form');
  
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    age: '',
    company: ''
  });
  const [stmVersion, setStmVersion] = useState(0);
  const [stmLoaded, setStmLoaded] = useState(false);

  // Token provider - fetches short-lived token from our API route
  // API key stays server-side, never exposed to browser
  const getToken = useCallback(async (): Promise<string> => {
    if (!instanceId) throw new Error('No instanceId');
    
    console.log('☁️ Fetching WS token for instance:', instanceId);
    const response = await fetch(`/api/ws-token?instanceId=${instanceId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get token');
    }
    
    const data = await response.json();
    console.log('☁️ Got WS token');
    return data.token;
  }, [instanceId]);

  useEffect(() => {
    if (!instanceId) return;

    console.log('☁️ FormExample init:', { instanceId, wsUrl: WS_BASE_URL });

    const adapter = new CloudAdapter({
      instanceId,
      projectId: 'cloud-demo',
      baseUrl: WS_BASE_URL,
      // No apiKey here - using tokenProvider instead (secure!)
    });

    // Set token provider for automatic token fetch
    adapter.setTokenProvider(getToken);

    adapter.on('connected', () => {
      console.log('☁️ WebSocket connected');
      setConnectionState('connected');
    });
    adapter.on('disconnected', () => {
      console.log('☁️ WebSocket disconnected');
      setConnectionState('disconnected');
    });
    adapter.on('error', (err) => {
      console.error('☁️ WebSocket error:', err);
      setConnectionState('error');
    });
    adapter.on('synced', () => {
      console.log('☁️ Data synced from cloud:', mindcacheRef.current.serialize());
      
      // Create default keys ONLY AFTER sync, and only if they don't exist in cloud
      ['name', 'role', 'age', 'company'].forEach(key => {
        if (!mindcacheRef.current.has(key)) {
          console.log('☁️ Creating default key:', key);
          mindcacheRef.current.set_value(key, '', { visible: true, readonly: false });
        }
      });
      
      setStmLoaded(true);
      loadFormData();
      setStmVersion(v => v + 1);
    });

    // Attach FIRST so local changes get queued
    adapter.attach(mindcacheRef.current);
    cloudAdapterRef.current = adapter;
    
    // DON'T create keys here - wait for sync first!
    
    adapter.connect();
    setConnectionState('connecting');

    loadFormData();
    mindcacheRef.current.subscribeToAll(loadFormData);

    return () => {
      mindcacheRef.current.unsubscribeFromAll(loadFormData);
      cloudAdapterRef.current?.disconnect();
      cloudAdapterRef.current?.detach();
    };
  }, [instanceId, getToken]);

  const loadFormData = () => {
    setFormData({
      name: mindcacheRef.current.get_value('name') || '',
      role: mindcacheRef.current.get_value('role') || '',
      age: mindcacheRef.current.get_value('age') || '',
      company: mindcacheRef.current.get_value('company') || ''
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mindcacheRef.current.set_value(field, value);
    setStmVersion(v => v + 1);
  };

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (!instanceId) {
    return (
      <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex items-center justify-center">
        <div className="text-yellow-400">Waiting for instance...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex gap-1">
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-cyan-400 mb-2">Chat Assistant</div>
          <div className="text-gray-400 text-sm">Ask me to update the form fields.</div>
        </div>
        <ChatInterface
          instanceId={instanceId}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current}
        />
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Form Example</div>
            <div className="text-gray-400 text-sm">Instance: {instanceId.slice(0, 8)}...</div>
          </div>
          <span className={`${getStatusColor()} text-lg`}>{getStatusIcon()}</span>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 space-y-4">
          {!stmLoaded ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading...
            </div>
          ) : (
            ['name', 'role', 'age', 'company'].map(field => (
              <div key={field}>
                <label className="block text-gray-400 font-mono text-sm mb-2 capitalize">{field}</label>
                <input
                  type="text"
                  value={formData[field as keyof typeof formData]}
                  onChange={(e) => handleChange(field, e.target.value)}
                  className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
                  placeholder={`Enter your ${field}`}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
