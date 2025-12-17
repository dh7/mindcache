'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMindCache } from 'mindcache';
import ChatInterface from './ChatInterface';
import STMEditor from './STMEditor';
import STMMenu from './STMMenu';
import Workflows from './Workflows';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

export default function ClientSTMDemo() {
  // Use the hook - handles all async init and cleanup automatically
  const { mindcache, isLoaded } = useMindCache({
    indexedDB: {
      dbName: 'client_demo_db',
      storeName: 'client_demo_store',
      debounceMs: 500
    }
  });

  const [leftWidth, setLeftWidth] = useState(70);
  const [isResizing, setIsResizing] = useState(false);
  const [stmVersion, setStmVersion] = useState(0);
  const [chatKey, setChatKey] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [keysInitialized, setKeysInitialized] = useState(false);

  // Workflow state
  const [workflowPrompt, setWorkflowPrompt] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('ready');

  // Initialize default keys once loaded
  useEffect(() => {
    if (!isLoaded || !mindcache) return;

    // If no saved data (fresh DB), create default keys
    const currentKeys = Object.keys(mindcache.getAll());
    const userKeys = currentKeys.filter(key => !key.startsWith('$'));

    if (userKeys.length === 0) {
      console.log('Creating default STM keys...');
      mindcache.set_value('name', 'Anonymous User');
      mindcache.set_value('preferences', 'No preferences set');
      mindcache.set_value('notes', 'No notes');
      console.log('Created keys:', Object.keys(mindcache.getAll()));
    }

    setKeysInitialized(true);
  }, [isLoaded, mindcache]);

  // Callback to force refresh of getTagged values
  const handleSTMChange = useCallback(() => {
    setStmVersion(v => v + 1);
  }, []);

  // Callback to fully refresh UI (chat, workflows) after load/import/clear
  const handleFullRefresh = useCallback(() => {
    console.log('🔄 Full UI refresh triggered');
    setStmVersion(v => v + 1);
    setChatKey(k => k + 1);
  }, []);

  // Define initial assistant message using tagged content
  const getInitialMessages = () => {
    if (!keysInitialized || !mindcache) {
      return [
        {
          id: 'welcome-message',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Hello!' }],
          createdAt: new Date()
        }
      ];
    }

    const assistantFirstMessage = mindcache.getTagged("AssistantFirstMessage");
    const messageText = assistantFirstMessage
      ? assistantFirstMessage.split(': ').slice(1).join(': ')
      : 'Hello!';

    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: messageText }],
        createdAt: new Date()
      }
    ];
  };

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

  // Handle mouse events for resizing
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

  // Add global mouse event listeners
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

  if (!isLoaded || !mindcache || !keysInitialized) {
    return (
      <div className="h-screen bg-black text-green-400 font-mono p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading STM...</div>
          <div className="animate-pulse">●●●</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-green-400 font-mono p-6 flex overflow-hidden resize-container">
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
          stmLoaded={keysInitialized}
          stmVersion={stmVersion}
          mindcacheInstance={mindcache}
        />
      </div>

      {/* Resizer */}
      <div
        className={`w-1 bg-transparent hover:bg-green-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${isResizing ? 'bg-green-400 bg-opacity-50' : ''
          }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      />

      {/* Right Panel - STM Menu + Editor + Workflows */}
      <div
        style={{ width: `${100 - leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <STMMenu
          onRefresh={handleFullRefresh}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
        />
        <STMEditor
          onSTMChange={handleSTMChange}
          selectedTags={selectedTags}
        />
        <Workflows
          onSendPrompt={handleSendPrompt}
          isExecuting={chatStatus !== 'ready'}
          onExecutionComplete={handleExecutionComplete}
          stmLoaded={keysInitialized}
          stmVersion={stmVersion}
        />
      </div>
    </div>
  );
}
