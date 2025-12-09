'use client';

import { useChat, UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { MindCache } from 'mindcache';
import ChatConversation from './ChatConversation';

interface ChatInterfaceProps {
  instanceId: string;
  workflowPrompt?: string;
  onWorkflowPromptSent?: () => void;
  onStatusChange?: (status: string) => void;
  stmLoaded?: boolean;
  stmVersion?: number;
  mindcacheInstance?: MindCache;
  mode?: 'edit' | 'use';
}

export default function ChatInterface({ 
  instanceId,
  workflowPrompt, 
  onWorkflowPromptSent, 
  onStatusChange, 
  stmLoaded,
  mindcacheInstance,
  mode = 'use'
}: ChatInterfaceProps) {
  const defaultInstance = useRef(new MindCache());
  const mindcacheRef = mindcacheInstance || defaultInstance.current;
  const [isConnected, setIsConnected] = useState(true);
  const [input, setInput] = useState('');

  const { messages, sendMessage, status, error } = useChat({
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello! I\'m connected to MindCache Cloud. I can read and write data that syncs in real-time!' }],
      }
    ] as UIMessage[],
    transport: new DefaultChatTransport({
      api: '/api/chat-cloud-stm',
      fetch: async (url, init) => {
        try {
          const originalBody = init?.body ? JSON.parse(init.body as string) : {};
          const nextBody = { ...originalBody, mode, instanceId };
          return fetch(url, { ...init, body: JSON.stringify(nextBody) });
        } catch {
          return fetch(url, init);
        }
      },
    }),
    onError: (err) => {
      console.error('☁️ Chat error:', err);
      setIsConnected(false);
    },
    onFinish: () => {
      setIsConnected(true);
    },
  });

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  useEffect(() => {
    if (workflowPrompt && status === 'ready') {
      const processedPrompt = mindcacheRef.injectSTM(workflowPrompt);
      sendMessage({
        role: 'user',
        parts: [{ type: 'text' as const, text: processedPrompt }],
      });
      
      if (onWorkflowPromptSent) {
        onWorkflowPromptSent();
      }
    }
  }, [workflowPrompt, status, sendMessage, onWorkflowPromptSent, mindcacheRef]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === 'ready') {
      const processedInput = mindcacheRef.injectSTM(input);
      sendMessage({
        role: 'user',
        parts: [{ type: 'text' as const, text: processedInput }],
      });
      setInput('');
    }
  };

  return (
    <div className="flex-1 flex flex-col pr-1 min-h-0">
      {!isConnected && (
        <div className="bg-red-900 bg-opacity-50 text-red-300 text-xs p-2 rounded mb-2">
          ⚠️ Connection error. Check your API key.
        </div>
      )}
      
      {error && (
        <div className="bg-red-900 bg-opacity-50 text-red-300 text-xs p-2 rounded mb-2">
          Error: {error.message}
        </div>
      )}

      <ChatConversation messages={messages} />
      
      <form onSubmit={handleSubmit} className="min-w-0 flex-shrink-0">
        <div className="flex items-center gap-2 bg-black border border-gray-600 rounded px-2 py-2">
          <input
            className="flex-1 min-w-0 bg-black text-cyan-400 font-mono text-sm focus:outline-none placeholder-gray-600 disabled:opacity-50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status !== 'ready'}
            placeholder={status !== 'ready' ? "AI is thinking..." : "Ask something..."}
          />
          <button 
            type="submit"
            disabled={status !== 'ready' || !input.trim()}
            className="bg-cyan-400 text-black font-mono px-2 py-1 text-sm rounded hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {status !== 'ready' ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
