'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { mindcache } from 'mindcache';
import ChatInterface from './ChatInterface';
import STMEditor from './STMEditor';
import STMMenu from './STMMenu';
import Workflows from './Workflows';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

export default function ClientSTMDemo() {
  const mindcacheRef = useRef(mindcache);
  const [leftWidth, setLeftWidth] = useState(70); // Percentage width for left panel
  const [isResizing, setIsResizing] = useState(false);
  const [stmLoaded, setStmLoaded] = useState(false); // Track STM loading state
  const [stmVersion, setStmVersion] = useState(0); // Force refresh of getTagged values
  const [chatKey, setChatKey] = useState(0); // Force chat remount on load/import/clear
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // Tag filter for STM Editor
  
  // Workflow state
  const [workflowPrompt, setWorkflowPrompt] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('ready');

  // Callback to force refresh of getTagged values
  const handleSTMChange = useCallback(() => {
    setStmVersion(v => v + 1);
  }, []);

  // Callback to fully refresh UI (chat, workflows) after load/import/clear
  const handleFullRefresh = useCallback(() => {
    console.log('🔄 Full UI refresh triggered');
    // Increment version to refresh workflows and STM editor
    setStmVersion(v => v + 1);
    // Increment chat key to force remount with new initial messages
    setChatKey(k => k + 1);
  }, []);


  // Define initial assistant message using tagged content
  const getInitialMessages = () => {
    if (!stmLoaded) {
      // Return default message while STM is loading
      return [
        {
          id: 'welcome-message',
          role: 'assistant' as const,
          parts: [
            {
              type: 'text' as const,
              text: 'Hello!'
            }
          ],
          createdAt: new Date()
        }
      ];
    }

    const assistantFirstMessage = mindcacheRef.current.getTagged("AssistantFirstMessage");
    const messageText = assistantFirstMessage 
      ? assistantFirstMessage.split(': ').slice(1).join(': ') // Extract value part after "key: "
      : 'Hello!';
    
    
    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [
          {
            type: 'text' as const,
            text: messageText
          }
        ],
        createdAt: new Date()
      }
    ];
  };
  
  // Initialize with auto-load and default keys
  useEffect(() => {
    const initializeSTM = async () => {
      // Try to load from localStorage first
      const saved = localStorage.getItem('mindcache_stm');
      if (saved) {
        try {
          mindcacheRef.current.fromJSON(saved);
          console.log('✅ Auto-loaded STM from localStorage');
        } catch (error) {
          console.error('❌ Failed to auto-load STM:', error);
        }
      }

      // If no saved data, create default keys
      const currentKeys = Object.keys(mindcacheRef.current.getAll());
      const userKeys = currentKeys.filter(key => !key.startsWith('$'));
      
      if (userKeys.length === 0) {
        console.log('Creating default STM keys...');
        mindcacheRef.current.set_value('name', 'Anonymous User');
        mindcacheRef.current.set_value('preferences', 'No preferences set');
        mindcacheRef.current.set_value('notes', 'No notes');
        console.log('Created keys:', Object.keys(mindcacheRef.current.getAll()));
      }
      
      // Set loaded state after everything is initialized
      setStmLoaded(true);
    };

    initializeSTM();
  }, []);

  const handleToolCall = async (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
    // ChatInterface now handles all tool calls including analyze_image and generate_image
  };

  // Workflow handlers
  const handleSendPrompt = (prompt: string) => {
    setWorkflowPrompt(prompt);
  };

  const handleWorkflowPromptSent = () => {
    setWorkflowPrompt(''); // Clear the prompt after sending
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
    if (!isResizing) {
      return;
    }
    
    const containerRect = document.querySelector('.resize-container')?.getBoundingClientRect();
    if (!containerRect) {
      return;
    }
    
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    // Constrain between 20% and 80%
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

  if (!stmLoaded) {
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
          key={chatKey} // Force remount on load/import/clear
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
      
      {/* Resizer - invisible but functional */}
      <div
        className={`w-1 bg-transparent hover:bg-green-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${
          isResizing ? 'bg-green-400 bg-opacity-50' : ''
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
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
        />
      </div>
    </div>
  );
}
