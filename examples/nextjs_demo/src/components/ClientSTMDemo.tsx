'use client';

import { useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';
import ChatInterface from './ChatInterface';
import STMEditor from './STMEditor';

export default function ClientSTMDemo() {
  const mindcacheRef = useRef(mindcache);
  
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

  const handleToolCall = (toolCall: any) => {
    console.log('🔧 Tool call executed:', toolCall);
  };

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-6 flex">
      <ChatInterface onToolCall={handleToolCall} />
      <STMEditor />
    </div>
  );
}
