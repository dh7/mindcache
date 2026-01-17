'use client';

import { useState, useCallback, useEffect } from 'react';
import { MindCacheChat, useMindCacheContext } from 'mindcache';
import STMEditor from '@/components/STMEditor';
import STMToolbar from '@/components/STMToolbar';

export default function Home() {
  const { mindcache, isLoaded, hasApiKey } = useMindCacheContext();
  const [leftWidth, setLeftWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [stmVersion, setStmVersion] = useState(0);
  const [chatKey, setChatKey] = useState(0);

  // Initialize default keys
  useEffect(() => {
    if (!isLoaded || !mindcache) return;

    const currentKeys = Object.keys(mindcache.getAll());
    const userKeys = currentKeys.filter(key => !key.startsWith('$'));

    if (userKeys.length === 0) {
      mindcache.set_value('name', 'Anonymous User', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      mindcache.set_value('preferences', 'No preferences set', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      mindcache.set_value('notes', 'No notes yet', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
    }
  }, [isLoaded, mindcache]);

  const handleSTMChange = useCallback(() => {
    setStmVersion(v => v + 1);
  }, []);

  const handleFullRefresh = useCallback(() => {
    setStmVersion(v => v + 1);
    setChatKey(k => k + 1);
  }, []);

  // Resizing handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newLeftWidth = (e.clientX / window.innerWidth) * 100;
      setLeftWidth(Math.min(Math.max(newLeftWidth, 30), 70));
    };

    const handleMouseUp = () => setIsResizing(false);

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
  }, [isResizing]);

  if (!isLoaded) {
    return (
      <div style={{ 
        height: '100dvh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '1.5rem' }}>Loading MindCache...</div>
        <div style={{ animation: 'pulse 1s infinite' }}>●●●</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Chat */}
      <div style={{ width: `${leftWidth}%`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          padding: '12px 16px', 
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 600 }}>💬 Chat</span>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {hasApiKey ? '🟢 API Key Set' : '🔴 No API Key'}
          </span>
        </div>
        <MindCacheChat
          key={chatKey}
          welcomeMessage="Hello! I can read and update your MindCache data. Try asking me to remember something!"
          placeholder="Ask me anything..."
          style={{ flex: 1 }}
          onMindCacheChange={handleSTMChange}
        />
      </div>

      {/* Resizer */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          background: isResizing ? 'rgba(34, 197, 94, 0.5)' : 'transparent',
          cursor: 'col-resize',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)')}
        onMouseLeave={(e) => !isResizing && (e.currentTarget.style.background = 'transparent')}
      />

      {/* Right: STM Editor */}
      <div style={{ 
        width: `${100 - leftWidth}%`, 
        display: 'flex', 
        flexDirection: 'column',
        borderLeft: '1px solid #333'
      }}>
        <div style={{ 
          padding: '12px 16px', 
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 600 }}>🧠 MindCache Editor</span>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {Object.keys(mindcache?.getAll() || {}).filter(k => !k.startsWith('$')).length} keys
          </span>
        </div>
        <STMToolbar onRefresh={handleFullRefresh} />
        <STMEditor onSTMChange={handleSTMChange} stmVersion={stmVersion} />
      </div>
    </div>
  );
}
