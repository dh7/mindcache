'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { mindcache } from 'mindcache';
import ChatInterface from './ChatInterface';
import STMEditor from './STMEditor';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

export default function ClientSTMDemo() {
  const mindcacheRef = useRef(mindcache);
  const [leftWidth, setLeftWidth] = useState(70); // Percentage width for left panel
  const [isResizing, setIsResizing] = useState(false);
  
  // Define initial assistant message
  const initialMessages = [
    {
      id: 'welcome-message',
      role: 'assistant' as const,
      parts: [
        {
          type: 'text' as const,
          text: 'Hello! I\'m your AI assistant with access to your short-term memory. I can help you manage your preferences, notes, and other information. What would you like to do today?'
        }
      ],
      createdAt: new Date()
    }
  ];
  
  // Initialize with auto-load and default keys
  useEffect(() => {
    // Try to load from localStorage first
    const saved = localStorage.getItem('mindcache_stm');
    if (saved) {
      try {
        mindcacheRef.current.fromJSON(saved);
        console.log('✅ Auto-loaded STM from localStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to auto-load STM:', error);
      }
    }

    // If no saved data, create default keys
    const currentKeys = Object.keys(mindcacheRef.current.getAll());
    const userKeys = currentKeys.filter(key => !key.startsWith('$'));
    
    if (userKeys.length === 0) {
      console.log('Creating default STM keys...');
      mindcacheRef.current.set_value('name', 'Anonymous User', { default: 'Anonymous User' });
      mindcacheRef.current.set_value('preferences', 'No preferences set', { default: 'No preferences set' });
      mindcacheRef.current.set_value('notes', 'No notes', { default: 'No notes' });
      console.log('Created keys:', Object.keys(mindcacheRef.current.getAll()));
    }
  }, []);

  const handleToolCall = (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
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

  return (
    <div className="h-screen bg-black text-green-400 font-mono p-6 flex overflow-hidden resize-container">
      {/* Left Panel - ChatInterface */}
      <div 
        style={{ width: `${leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <ChatInterface onToolCall={handleToolCall} initialMessages={initialMessages} />
      </div>
      
      {/* Resizer - invisible but functional */}
      <div
        className={`w-1 bg-transparent hover:bg-green-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${
          isResizing ? 'bg-green-400 bg-opacity-50' : ''
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      />
      
      {/* Right Panel - STMEditor */}
      <div 
        style={{ width: `${100 - leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <STMEditor />
      </div>
    </div>
  );
}
