'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';

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

  useEffect(() => {
    if (!instanceId) return;

    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL?.replace('https://', 'wss://');

    // Create STM keys
    ['name', 'role', 'age', 'company'].forEach(key => {
      if (!mindcacheRef.current.has(key)) {
        mindcacheRef.current.set_value(key, '', { visible: true, readonly: false });
      }
    });

    if (apiKey) {
      const adapter = new CloudAdapter({
        apiKey,
        instanceId,
        projectId: 'cloud-demo',
        baseUrl,
      });

      adapter.on('connected', () => setConnectionState('connected'));
      adapter.on('disconnected', () => setConnectionState('disconnected'));
      adapter.on('error', () => setConnectionState('error'));
      adapter.on('synced', () => {
        setStmLoaded(true);
        loadFormData();
        setStmVersion(v => v + 1);
      });

      adapter.attach(mindcacheRef.current);
      cloudAdapterRef.current = adapter;
      adapter.connect();
      setConnectionState('connecting');
    } else {
      setStmLoaded(true);
    }

    loadFormData();
    mindcacheRef.current.subscribeToAll(loadFormData);

    return () => {
      mindcacheRef.current.unsubscribeFromAll(loadFormData);
      cloudAdapterRef.current?.disconnect();
      cloudAdapterRef.current?.detach();
    };
  }, [instanceId]);

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
          {['name', 'role', 'age', 'company'].map(field => (
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
          ))}
        </div>
      </div>
    </div>
  );
}
