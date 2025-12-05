'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';
import CloudSTMEditor from './CloudSTMEditor';
import CloudSTMMenu from './CloudSTMMenu';
import Workflows from './Workflows';

export default function CloudSTMDemo() {
  const { getInstanceId } = useInstances();
  const instanceId = getInstanceId('mindcache-editor');
  
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [leftWidth, setLeftWidth] = useState(70);
  const [isResizing, setIsResizing] = useState(false);
  const [stmLoaded, setStmLoaded] = useState(false);
  const [stmVersion, setStmVersion] = useState(0);
  const [chatKey, setChatKey] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  
  const [workflowPrompt, setWorkflowPrompt] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('ready');

  const handleSTMChange = useCallback(() => {
    setStmVersion(v => v + 1);
  }, []);

  const handleFullRefresh = useCallback(() => {
    setStmVersion(v => v + 1);
    setChatKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!instanceId) return;

    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL?.replace('https://', 'wss://');

    // Initialize with default keys
    const currentKeys = Object.keys(mindcacheRef.current.getAll());
    if (currentKeys.filter(k => !k.startsWith('$')).length === 0) {
      mindcacheRef.current.set_value('name', 'Anonymous User');
      mindcacheRef.current.set_value('preferences', 'No preferences set');
      mindcacheRef.current.set_value('notes', 'No notes');
    }

    if (apiKey) {
      console.log('☁️ Connecting to instance:', instanceId);
      
      const adapter = new CloudAdapter({
        apiKey,
        instanceId,
        projectId: 'cloud-demo',
        baseUrl,
      });

      adapter.on('connected', () => {
        console.log('☁️ Connected');
        setConnectionState('connected');
      });

      adapter.on('disconnected', () => {
        console.log('☁️ Disconnected');
        setConnectionState('disconnected');
      });

      adapter.on('error', (error) => {
        console.error('☁️ Error:', error);
        setConnectionState('error');
      });

      adapter.on('synced', () => {
        console.log('☁️ Synced');
        setStmLoaded(true);
        setStmVersion(v => v + 1);
      });

      adapter.attach(mindcacheRef.current);
      cloudAdapterRef.current = adapter;

      adapter.connect();
      setConnectionState('connecting');

      mindcacheRef.current.subscribeToAll(handleSTMChange);

      return () => {
        adapter.disconnect();
        adapter.detach();
        mindcacheRef.current.unsubscribeFromAll(handleSTMChange);
      };
    } else {
      setStmLoaded(true);
    }
  }, [instanceId, handleSTMChange]);

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
    setLeftWidth(Math.min(Math.max(newLeftWidth, 20), 80));
  }, [isResizing]);

  const handleMouseUp = useCallback(() => setIsResizing(false), []);

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

  if (!instanceId) {
    return (
      <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex items-center justify-center">
        <div className="text-yellow-400">Waiting for instance...</div>
      </div>
    );
  }

  if (!stmLoaded && connectionState === 'connecting') {
    return (
      <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">☁️ Connecting...</div>
          <div className="animate-pulse">●●●</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex overflow-hidden resize-container">
      {/* Left Panel - Chat */}
      <div style={{ width: `${leftWidth}%` }} className="flex flex-col min-h-0">
        <ChatInterface 
          key={chatKey}
          instanceId={instanceId}
          workflowPrompt={workflowPrompt}
          onWorkflowPromptSent={() => setWorkflowPrompt('')}
          onStatusChange={setChatStatus}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current}
          mode="use"
        />
      </div>
      
      {/* Resizer */}
      <div
        className={`w-1 bg-transparent hover:bg-cyan-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${isResizing ? 'bg-cyan-400 bg-opacity-50' : ''}`}
        onMouseDown={handleMouseDown}
      />
      
      {/* Right Panel */}
      <div style={{ width: `${100 - leftWidth}%` }} className="flex flex-col min-h-0">
        <CloudSTMMenu 
          connectionState={connectionState}
          instanceId={instanceId}
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
          onSendPrompt={setWorkflowPrompt}
          isExecuting={chatStatus !== 'ready'}
          onExecutionComplete={() => {}}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current}
        />
      </div>
    </div>
  );
}
