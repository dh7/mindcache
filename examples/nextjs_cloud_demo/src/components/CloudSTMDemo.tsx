'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import ChatInterface from './ChatInterface';
import CloudSTMEditor from './CloudSTMEditor';
import CloudSTMMenu from './CloudSTMMenu';
import Workflows from './Workflows';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

export default function CloudSTMDemo() {
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [leftWidth, setLeftWidth] = useState(70);
  const [isResizing, setIsResizing] = useState(false);
  const [stmLoaded, setStmLoaded] = useState(false);
  const [stmVersion, setStmVersion] = useState(0);
  const [chatKey, setChatKey] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  
  // Workflow state
  const [workflowPrompt, setWorkflowPrompt] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('ready');

  // Callback to force refresh of getTagged values
  const handleSTMChange = useCallback(() => {
    setStmVersion(v => v + 1);
  }, []);

  // Callback to fully refresh UI
  const handleFullRefresh = useCallback(() => {
    console.log('🔄 Full UI refresh triggered');
    setStmVersion(v => v + 1);
    setChatKey(k => k + 1);
  }, []);

  // Define initial assistant message
  const getInitialMessages = () => {
    if (!stmLoaded) {
      return [
        {
          id: 'welcome-message',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Connecting to cloud...' }],
          createdAt: new Date()
        }
      ];
    }

    const assistantFirstMessage = mindcacheRef.current.getTagged("AssistantFirstMessage");
    const messageText = assistantFirstMessage 
      ? assistantFirstMessage.split(': ').slice(1).join(': ')
      : 'Hello! I\'m connected to MindCache Cloud. Your data syncs in real-time!';
    
    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: messageText }],
        createdAt: new Date()
      }
    ];
  };

  // Initialize CloudAdapter
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const instanceId = process.env.NEXT_PUBLIC_MINDCACHE_INSTANCE_ID;
    const projectId = process.env.NEXT_PUBLIC_MINDCACHE_PROJECT_ID;

    if (!apiKey || !instanceId || !projectId) {
      console.log('☁️ Cloud credentials not configured - running in local mode');
      // Initialize with default keys for local mode
      const currentKeys = Object.keys(mindcacheRef.current.getAll());
      const userKeys = currentKeys.filter(key => !key.startsWith('$'));
      
      if (userKeys.length === 0) {
        console.log('Creating default STM keys...');
        mindcacheRef.current.set_value('name', 'Anonymous User');
        mindcacheRef.current.set_value('preferences', 'No preferences set');
        mindcacheRef.current.set_value('notes', 'No notes');
      }
      
      setStmLoaded(true);
      return;
    }

    console.log('☁️ Initializing CloudAdapter...');
    
    const adapter = new CloudAdapter({
      apiKey,
      instanceId,
      projectId,
    });

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
      setStmLoaded(true);
      setStmVersion(v => v + 1);
    });

    adapter.attach(mindcacheRef.current);
    cloudAdapterRef.current = adapter;

    adapter.connect();
    setConnectionState('connecting');

    // Subscribe to STM changes
    const handleChange = () => {
      setStmVersion(v => v + 1);
    };
    mindcacheRef.current.subscribeToAll(handleChange);

    return () => {
      adapter.disconnect();
      adapter.detach();
      mindcacheRef.current.unsubscribeFromAll(handleChange);
    };
  }, []);

  const handleToolCall = async (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
  };

  // Workflow handlers
  const handleSendPrompt = (prompt: string) => {
    setWorkflowPrompt(prompt);
  };

  const handleWorkflowPromptSent = () => {
    setWorkflowPrompt('');
  };

  const handleExecutionComplete = () => {
    // Workflow execution complete
  };

  const handleStatusChange = (status: string) => {
    setChatStatus(status);
  };

  // Resizing handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const containerRect = document.querySelector('.resize-container')?.getBoundingClientRect();
    if (!containerRect) return;
    
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    const constrainedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
    setLeftWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  if (!stmLoaded && connectionState === 'connecting') {
    return (
      <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">☁️ Connecting to Cloud...</div>
          <div className="animate-pulse">●●●</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex overflow-hidden resize-container">
      {/* Left Panel - ChatInterface */}
      <div 
        style={{ width: `${leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <ChatInterface 
          key={chatKey}
          onToolCall={handleToolCall} 
          initialMessages={getInitialMessages()}
          workflowPrompt={workflowPrompt}
          onWorkflowPromptSent={handleWorkflowPromptSent}
          onStatusChange={handleStatusChange}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current}
        />
      </div>
      
      {/* Resizer */}
      <div
        className={`w-1 bg-transparent hover:bg-cyan-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${
          isResizing ? 'bg-cyan-400 bg-opacity-50' : ''
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      />
      
      {/* Right Panel - STM Menu + Editor + Workflows */}
      <div 
        style={{ width: `${100 - leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <CloudSTMMenu 
          connectionState={connectionState}
          onReconnect={() => cloudAdapterRef.current?.connect()}
          onRefresh={handleFullRefresh} 
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          mindcacheInstance={mindcacheRef.current}
        />
        <CloudSTMEditor 
          onSTMChange={handleSTMChange} 
          selectedTags={selectedTags}
          mindcacheInstance={mindcacheRef.current}
        />
        <Workflows 
          onSendPrompt={handleSendPrompt}
          isExecuting={chatStatus !== 'ready'}
          onExecutionComplete={handleExecutionComplete}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current}
        />
      </div>
    </div>
  );
}

