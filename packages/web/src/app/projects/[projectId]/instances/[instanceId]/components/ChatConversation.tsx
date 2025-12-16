'use client';

import { UIMessage } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';

interface MessagePart {
  type: string;
  text?: string;
  toolName?: string;
  result?: unknown;
}

interface ChatConversationProps {
  messages: UIMessage[];
}

export default function ChatConversation({ messages }: ChatConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessageContent = (message: UIMessage) => {
    // Handle parts array
    if (message.parts && Array.isArray(message.parts)) {
      return (message.parts as MessagePart[]).map((part, index) => {
        if (part.type === 'text' && part.text) {
          return <span key={index} className="break-words whitespace-pre-wrap">{part.text}</span>;
        }
        if (part.type === 'tool-invocation' || part.type === 'tool-call') {
          return (
            <div key={index} className="text-yellow-400 text-xs mt-1">
              🔧 {part.toolName}
            </div>
          );
        }
        if (part.type === 'tool-result') {
          const resultText = typeof part.result === 'string'
            ? part.result
            : JSON.stringify(part.result);
          return (
            <div key={index} className="text-green-500 text-xs mt-1">
              ✅ {resultText.length > 100 ? resultText.substring(0, 100) + '...' : resultText}
            </div>
          );
        }
        return null;
      });
    }
    return null;
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 border border-zinc-700 rounded space-y-2 min-h-0 mb-2 bg-zinc-900/50"
    >
      {messages.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-8">
          Start a conversation with the AI assistant...
        </div>
      ) : (
        messages.map((message) => (
          <div key={message.id} className="whitespace-pre-wrap mb-4">
            <div className={`ml-2 font-mono text-sm ${message.role === 'user' ? 'text-cyan-400' : 'text-zinc-300'}`}>
              {message.role === 'user' ? '< ' : '> '}
              {renderMessageContent(message)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

