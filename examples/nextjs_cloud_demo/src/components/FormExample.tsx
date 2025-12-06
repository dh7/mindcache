'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';

export default function FormExample() {
  const { getInstanceId } = useInstances();
  const instanceId = getInstanceId('form');

  // Create MindCache with cloud config - same simplicity as local!
  const mindcacheRef = useRef<MindCache | null>(null);
  if (!mindcacheRef.current && instanceId) {
    mindcacheRef.current = new MindCache({
      cloud: {
        instanceId,
        projectId: 'cloud-demo',
        tokenEndpoint: '/api/ws-token',
      }
    });
  }

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    age: '',
    company: ''
  });
  const [stmVersion, setStmVersion] = useState(0);

  // Subscribe to STM changes - same pattern as local!
  useEffect(() => {
    const mc = mindcacheRef.current;
    if (!mc || !mc.isLoaded) return;

    // Initialize keys if they don't exist
    ['name', 'role', 'age', 'company'].forEach(key => {
      if (!mc.has(key)) {
        mc.set_value(key, '', { visible: true, readonly: false });
      }
    });

    const loadFormData = () => {
      setFormData({
        name: mc.get_value('name') || '',
        role: mc.get_value('role') || '',
        age: mc.get_value('age') || '',
        company: mc.get_value('company') || ''
      });
      setStmVersion(v => v + 1);
    };

    loadFormData();
    mc.subscribeToAll(loadFormData);
    return () => mc.unsubscribeFromAll(loadFormData);
  }, [mindcacheRef.current?.isLoaded]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mindcacheRef.current?.set_value(field, value);
  };

  const getStatusIcon = () => {
    switch (mindcacheRef.current?.connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  const getStatusColor = () => {
    switch (mindcacheRef.current?.connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (!instanceId || !mindcacheRef.current) {
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
          stmLoaded={mindcacheRef.current.isLoaded}
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
          {!mindcacheRef.current.isLoaded ? (
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
