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

  // Debug: log message structure
  useEffect(() => {
    console.log('📨 Messages:', JSON.stringify(messages, null, 2));
  }, [messages]);

  const renderMessageContent = (message: UIMessage) => {
    // Handle parts array
    if (message.parts && Array.isArray(message.parts)) {
      return (message.parts as MessagePart[]).map((part, index) => {
        if (part.type === 'text' && part.text) {
          return <span key={index} className="break-words">{part.text}</span>;
        }
        if (part.type === 'tool-invocation' || part.type === 'tool-call') {
          return <div key={index} className="text-yellow-400 text-sm">🔧 {part.toolName}</div>;
        }
        if (part.type === 'tool-result') {
          const resultText = JSON.stringify(part.result);
          return <div key={index} className="text-green-500 text-sm">✅ {resultText.length > 50 ? resultText.substring(0, 50) + '...' : resultText}</div>;
        }
        return null;
      });
    }
    return null;
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 border border-gray-600 rounded space-y-2 min-h-0 mb-2">
      {messages.map((message) => (
        <div key={message.id} className="whitespace-pre-wrap mb-4">
          <div className={`ml-2 font-mono text-sm ${message.role === 'user' ? 'text-cyan-400' : 'text-gray-400'}`}>
            {message.role === 'user' ? '< ' : '> '}
            {renderMessageContent(message)}
          </div>
        </div>
      ))}
    </div>
  );
}
