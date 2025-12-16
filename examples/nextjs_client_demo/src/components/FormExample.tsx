'use client';

import { useEffect, useState } from 'react';
import { useMindCache } from 'mindcache';
import ChatInterface from './ChatInterface';
import type { TypedToolCall, ToolSet } from 'ai';

export default function FormExample() {
  // Use the hook - handles all async init and cleanup automatically
  const { mindcache, isLoaded } = useMindCache({
    indexedDB: {
      dbName: 'form_example_db',
      storeName: 'form_store',
      debounceMs: 500
    }
  });

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    age: '',
    company: ''
  });
  const [stmVersion, setStmVersion] = useState(0);
  const [keysInitialized, setKeysInitialized] = useState(false);

  // Initialize default keys and sync form state once loaded
  useEffect(() => {
    if (!isLoaded || !mindcache) return;

    // Create STM keys if they don't exist
    if (!mindcache.has('name')) {
      mindcache.set_value('name', '', { visible: true, readonly: false });
    }
    if (!mindcache.has('role')) {
      mindcache.set_value('role', '', { visible: true, readonly: false });
    }
    if (!mindcache.has('age')) {
      mindcache.set_value('age', '', { visible: true, readonly: false });
    }
    if (!mindcache.has('company')) {
      mindcache.set_value('company', '', { visible: true, readonly: false });
    }

    // Load initial values from STM into state
    setFormData({
      name: mindcache.get_value('name') || '',
      role: mindcache.get_value('role') || '',
      age: mindcache.get_value('age') || '',
      company: mindcache.get_value('company') || ''
    });

    // Subscribe to STM changes
    const handleSTMChange = () => {
      setFormData({
        name: mindcache.get_value('name') || '',
        role: mindcache.get_value('role') || '',
        age: mindcache.get_value('age') || '',
        company: mindcache.get_value('company') || ''
      });
    };

    mindcache.subscribeToAll(handleSTMChange);
    setKeysInitialized(true);

    return () => {
      mindcache.unsubscribeFromAll(handleSTMChange);
    };
  }, [isLoaded, mindcache]);

  // Handle form input changes
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (mindcache) {
      mindcache.set_value(field, value);
    }
    setStmVersion(v => v + 1);
  };

  // Handle tool calls
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
            text: 'Hello! I can help you fill out the form. Just tell me your name, role, age, and company.'
          }
        ],
        createdAt: new Date()
      }
    ];
  };

  // Show loading state until STM is ready
  if (!isLoaded || !mindcache || !keysInitialized) {
    return (
      <div className="h-screen bg-black text-green-400 font-mono p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading Form...</div>
          <div className="animate-pulse">●●●</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-green-400 font-mono p-6 flex gap-1">
      {/* Left Panel - Chat */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-green-400 mb-2">Chat Assistant</div>
          <div className="text-gray-400 text-sm">Ask me to read or update the form.</div>
        </div>

        <ChatInterface
          onToolCall={handleToolCall}
          initialMessages={getInitialMessages()}
          stmLoaded={keysInitialized}
          stmVersion={stmVersion}
          systemPrompt="You are a helpful assistant that can read and update form fields. The user has a form with the following fields: name, role, age, and company. These fields are stored in a short-term memory (STM) system. You can read the current values and update them using the available tools. Be helpful and conversational."
          mindcacheInstance={mindcache}
        />
      </div>

      {/* Right Panel - Form */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-green-400 mb-2">Form Example</div>
          <div className="text-gray-400 text-sm">Fields uses mindCache</div>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 space-y-4">
          {/* Name Field */}
          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-green-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
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
              className="w-full bg-black border border-gray-600 rounded text-green-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
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
              className="w-full bg-black border border-gray-600 rounded text-green-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
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
              className="w-full bg-black border border-gray-600 rounded text-green-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="Enter your company"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
