'use client';

import { useState, useRef } from 'react';
import { mindcache } from 'mindcache';

interface ChatInputProps {
  onSendMessage: (message: { role: 'user'; parts: Array<{ type: 'text'; text: string }> }) => void;
  status: string;
}

export default function ChatInput({ onSendMessage, status }: ChatInputProps) {
  const mindcacheRef = useRef(mindcache);
  const [input, setInput] = useState('');
  
  // Track loading state based on status
  const isLoading = status !== 'ready';

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (input.trim() && status === 'ready') {
          // Process the input through injectSTM to replace {key} placeholders with STM values
          const processedInput = mindcacheRef.current.injectSTM(input);
          // Send message with processed text
          onSendMessage({
            role: 'user',
            parts: [{ type: 'text' as const, text: processedInput }]
          });
          setInput('');
        }
      }}
      className="flex gap-2 min-w-0"
    >
      <input
        className="flex-1 min-w-0 bg-black text-green-400 font-mono border border-green-400 rounded px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400 placeholder-green-600 disabled:opacity-50"
        value={input}
        onChange={e => setInput(e.target.value)}
        disabled={isLoading}
        placeholder={isLoading ? "AI is thinking..." : "Ask something... (use {{name}}, {{preferences}}, {{notes}}, {{$date}}, {{$time}})"}
      />
      <button 
        type="submit"
        disabled={status !== 'ready' || !input.trim()}
        className="bg-green-400 text-black font-mono px-2 py-2 text-sm rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
      >
        {isLoading ? '...' : 'Send'}
      </button>
    </form>
  );
}
