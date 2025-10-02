'use client';

import { useState, useRef } from 'react';
import { mindcache } from 'mindcache';

interface ChatInputProps {
  onSendMessage: (message: { role: 'user'; parts: Array<{ type: 'text'; text: string }>; metadata?: any }) => void;
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
          // Process the input through injectSTM to replace {{key}} placeholders with STM values
          const processedInput = mindcacheRef.current.injectSTM(input);
          // Send message with original text for display, processed text in metadata for LLM
          onSendMessage({
            role: 'user',
            parts: [{ type: 'text' as const, text: input }], // Original text with {{key}} for display
            metadata: { processedText: processedInput } // Processed text for LLM
          });
          setInput('');
        }
      }}
      className="min-w-0"
    >
      <div className="flex items-center gap-2 bg-black border border-green-400 rounded px-2 py-2">
        <input
          className="flex-1 min-w-0 bg-black text-green-400 font-mono text-sm focus:outline-none placeholder-gray-600 disabled:opacity-50"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          placeholder={isLoading ? "AI is thinking..." : "Ask something... (use {{key}}, if you want to use a key from the STM)"}
        />
        <button 
          type="submit"
          disabled={status !== 'ready' || !input.trim()}
          className="bg-green-400 text-black font-mono px-2 py-1 text-xs rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
}
