'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { MindCache } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';
import CloudSTMEditor from './CloudSTMEditor';
import CloudSTMMenu from './CloudSTMMenu';
import Workflows from './Workflows';

export default function CloudSTMDemo() {
  const { getInstanceId, error: instanceError } = useInstances();
  const instanceId = getInstanceId('mindcache-editor');

  // Create MindCache with cloud config
  const mindcacheRef = useRef<MindCache | null>(null);
  if (!mindcacheRef.current && instanceId) {
    mindcacheRef.current = new MindCache({
      cloud: {
        instanceId,
        tokenEndpoint: '/api/ws-token',
        baseUrl: process.env.NEXT_PUBLIC_MINDCACHE_API_URL,
      }
    });
  }

  const [leftWidth, setLeftWidth] = useState(70);
  const [isResizing, setIsResizing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [stmVersion, setStmVersion] = useState(0);
  const [chatKey, setChatKey] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  
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
    const mc = mindcacheRef.current;
    if (!mc) return;

    const handleChange = () => {
      setIsLoaded(mc.isLoaded);
      setConnectionState(mc.connectionState);
      
      if (mc.isLoaded) {
        // Initialize with default keys if empty
        const currentKeys = Object.keys(mc.getAll());
        if (currentKeys.filter(k => !k.startsWith('$')).length === 0) {
          mc.set_value('name', 'Anonymous User');
          mc.set_value('preferences', 'No preferences set');
          mc.set_value('notes', 'No notes');
        }
      }
      
      setStmVersion(v => v + 1);
    };

    handleChange();
    mc.subscribeToAll(handleChange);
    return () => mc.unsubscribeFromAll(handleChange);
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
        <div className="max-w-lg text-center space-y-4">
          <div className="text-yellow-400 text-lg">⚠️ Instance Not Configured</div>
          <p className="text-gray-400 text-sm">
            {instanceError || 'MindCache Editor instance ID not set.'}
          </p>
          <div className="text-left bg-gray-900 p-4 rounded-lg border border-gray-700">
            <p className="text-gray-500 text-xs mb-2">Add to .env.local:</p>
            <code className="text-green-400 text-sm">
              NEXT_PUBLIC_INSTANCE_MINDCACHE_EDITOR=your-instance-id
            </code>
          </div>
          <p className="text-gray-500 text-xs">
            Get instance IDs from the MindCache web UI (localhost:3003)
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded && connectionState === 'connecting') {
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
          stmLoaded={isLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current!}
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
          onReconnect={() => {/* MindCache handles reconnection automatically */}}
          onRefresh={handleFullRefresh} 
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          mindcacheInstance={mindcacheRef.current!}
        />
        <CloudSTMEditor 
          onSTMChange={handleSTMChange} 
          selectedTags={selectedTags}
          mindcacheInstance={mindcacheRef.current!}
        />
        <Workflows 
          onSendPrompt={setWorkflowPrompt}
          isExecuting={chatStatus !== 'ready'}
          onExecutionComplete={() => {}}
          stmLoaded={isLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current!}
        />
      </div>
    </div>
  );
}
