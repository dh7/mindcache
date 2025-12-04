'use client';

import { useState, useRef } from 'react';
import { MindCache } from 'mindcache';

interface ChatInputProps {
  onSendMessage: (message: { role: 'user'; parts: Array<{ type: 'text'; text: string }>; metadata?: any }) => void;
  status: string;
  mindcacheInstance?: MindCache;
}

export default function ChatInput({ onSendMessage, status, mindcacheInstance }: ChatInputProps) {
  const defaultInstance = useRef(new MindCache());
  const mindcacheRef = mindcacheInstance || defaultInstance.current;
  const [input, setInput] = useState('');
  
  const isLoading = status !== 'ready';

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (input.trim() && status === 'ready') {
          const processedInput = mindcacheRef.injectSTM(input);
          onSendMessage({
            role: 'user',
            parts: [{ type: 'text' as const, text: input }],
            metadata: { processedText: processedInput }
          });
          setInput('');
        }
      }}
      className="min-w-0 flex-shrink-0"
    >
      <div className="flex items-center gap-2 bg-black border border-gray-600 rounded px-2 py-2">
        <input
          className="flex-1 min-w-0 bg-black text-cyan-400 font-mono text-sm focus:outline-none placeholder-gray-600 disabled:opacity-50"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          placeholder={isLoading ? "AI is thinking..." : "Ask something... (use {{key}}, if you want to use a key from the STM)"}
        />
        <button 
          type="submit"
          disabled={status !== 'ready' || !input.trim()}
          className="bg-cyan-400 text-black font-mono px-2 py-1 text-sm rounded hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
}

