'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import ChatInterface from './ChatInterface';
import type { TypedToolCall, ToolSet } from 'ai';

export default function FormExample() {
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

  // Initialize STM with form fields and cloud connection
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const instanceId = process.env.NEXT_PUBLIC_MINDCACHE_INSTANCE_ID;
    const projectId = process.env.NEXT_PUBLIC_MINDCACHE_PROJECT_ID;

    // Create STM keys if they don't exist
    if (!mindcacheRef.current.has('name')) {
      mindcacheRef.current.set_value('name', '', { visible: true, readonly: false });
    }
    if (!mindcacheRef.current.has('role')) {
      mindcacheRef.current.set_value('role', '', { visible: true, readonly: false });
    }
    if (!mindcacheRef.current.has('age')) {
      mindcacheRef.current.set_value('age', '', { visible: true, readonly: false });
    }
    if (!mindcacheRef.current.has('company')) {
      mindcacheRef.current.set_value('company', '', { visible: true, readonly: false });
    }

    // Initialize CloudAdapter if credentials are available
    if (apiKey && instanceId && projectId) {
      const adapter = new CloudAdapter({
        apiKey,
        instanceId,
        projectId,
      });

      adapter.on('connected', () => {
        console.log('☁️ Form connected to cloud');
        setConnectionState('connected');
      });

      adapter.on('disconnected', () => {
        setConnectionState('disconnected');
      });

      adapter.on('error', (error) => {
        console.error('☁️ Cloud error:', error);
        setConnectionState('error');
      });

      adapter.on('synced', () => {
        console.log('☁️ Form synced');
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

    // Load initial values from STM
    loadFormData();

    // Subscribe to STM changes
    const handleSTMChange = () => {
      loadFormData();
    };

    mindcacheRef.current.subscribeToAll(handleSTMChange);

    return () => {
      mindcacheRef.current.unsubscribeFromAll(handleSTMChange);
      if (cloudAdapterRef.current) {
        cloudAdapterRef.current.disconnect();
        cloudAdapterRef.current.detach();
      }
    };
  }, []);

  const loadFormData = () => {
    setFormData({
      name: mindcacheRef.current.get_value('name') || '',
      role: mindcacheRef.current.get_value('role') || '',
      age: mindcacheRef.current.get_value('age') || '',
      company: mindcacheRef.current.get_value('company') || ''
    });
  };

  // Handle form input changes
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mindcacheRef.current.set_value(field, value);
    setStmVersion(v => v + 1);
  };

  const handleToolCall = async (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
  };

  const getInitialMessages = () => {
    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [
          {
            type: 'text' as const,
            text: 'Hello! I can help you fill out the form. Just tell me your name, role, age, and company. Your data syncs to the cloud automatically!'
          }
        ],
        createdAt: new Date()
      }
    ];
  };

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex gap-1">
      {/* Left Panel - Chat */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-cyan-400 mb-2">Chat Assistant</div>
          <div className="text-gray-400 text-sm">Ask me to read or update the form.</div>
        </div>

        <ChatInterface
          onToolCall={handleToolCall}
          initialMessages={getInitialMessages()}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          systemPrompt="You are a helpful assistant that can read and update form fields. The user has a form with the following fields: name, role, age, and company. These fields are stored in a cloud-synced short-term memory (STM) system. You can read the current values and update them using the available tools. Be helpful and conversational."
          mindcacheInstance={mindcacheRef.current}
        />
      </div>

      {/* Right Panel - Form */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Form Example</div>
            <div className="text-gray-400 text-sm">Fields synced to cloud</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`${getConnectionStatusColor()} text-lg`}>
              {getConnectionStatusIcon()}
            </span>
            <span className={`${getConnectionStatusColor()} text-xs`}>
              {connectionState === 'connected' ? 'Cloud' : connectionState}
            </span>
          </div>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 space-y-4">
          {/* Name Field */}
          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="Enter your name"
            />
          </div>

          {/* Role Field */}
          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Role</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => handleChange('role', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="Enter your role"
            />
          </div>

          {/* Age Field */}
          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Age</label>
            <input
              type="text"
              value={formData.age}
              onChange={(e) => handleChange('age', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="Enter your age"
            />
          </div>

          {/* Company Field */}
          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => handleChange('company', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="Enter your company"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

