'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function ChatDemo() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat-v5',
    }),
    messages: [
      {
        id: 'greeting',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'Hello there, how are you?' }],
      },
    ],
  });
  const [input, setInput] = useState('');

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-6 flex flex-col">
      <div className="w-full max-w-4xl mx-auto flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((message: any) => (
          <div key={message.id} className="whitespace-pre-wrap">
            <span className={`font-bold ${message.role === 'user' ? 'text-green-400' : 'text-gray-400'}`}>
              {message.role === 'user' ? '' : '> '}
            </span>
            <span className={message.role === 'user' ? 'text-green-400' : 'text-gray-400'}>
              {message.parts.map((part: any, index: number) =>
                part.type === 'text' ? <span key={index}>{part.text}</span> : null,
              )}
            </span>
          </div>
        ))}
        {status === "streaming" && <div className="text-gray-500 animate-pulse">Processing...</div>}
      </div>
      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="w-full max-w-4xl mx-auto flex gap-2"
      >
        <input
          className="flex-1 bg-black text-green-400 font-mono border border-green-400 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-400 placeholder-green-600"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Enter command..."
        />
        <button 
          type="submit" 
          disabled={status !== 'ready'}
          className="bg-green-400 text-black font-mono px-4 py-2 rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          EXEC
        </button>
      </form>
    </div>
  );
}
