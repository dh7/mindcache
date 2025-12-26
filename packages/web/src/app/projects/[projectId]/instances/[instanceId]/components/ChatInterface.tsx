'use client';

import { useChat, UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

interface ChatInterfaceProps {
  instanceId: string;
  mode?: 'edit' | 'use';
}

export default function ChatInterface({
  instanceId,
  mode = 'use'
}: ChatInterfaceProps) {
  const [isConnected, setIsConnected] = useState(true);
  const [input, setInput] = useState('');

  const { messages, sendMessage, status, error } = useChat({
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        parts: [{
          type: 'text',
          text: 'Hello! I\'m your MindCache AI assistant. I can read SystemPrompt keys and write to LLMWrite keys. How can I help you?'
        }]
      }
    ] as UIMessage[],
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: async (url, init) => {
        try {
          const originalBody = init?.body ? JSON.parse(init.body as string) : {};
          const nextBody = { ...originalBody, mode, instanceId };
          return fetch(url, { ...init, body: JSON.stringify(nextBody) });
        } catch {
          return fetch(url, init);
        }
      }
    }),
    onError: (err) => {
      console.error('💬 Chat error:', err);
      setIsConnected(false);
    },
    onFinish: () => {
      setIsConnected(true);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== 'ready') {
      return;
    }

    sendMessage({
      role: 'user',
      parts: [{ type: 'text' as const, text: input }]
    });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-700 rounded-lg p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-cyan-400 font-mono text-sm font-semibold">AI Assistant</h3>
        <div className="flex items-center gap-2">
          {status === 'streaming' && (
            <span className="text-yellow-400 text-xs animate-pulse">●</span>
          )}
          <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {status === 'ready' ? 'Ready' : status === 'streaming' ? 'Thinking...' : status}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-900/20 border border-red-700 rounded text-red-400 text-xs">
          {(() => {
            // Try to parse JSON error from API
            try {
              const msg = error.message;
              if (msg.includes('context_length_exceeded')) {
                return (
                  <div>
                    <strong>⚠️ Context too large:</strong> Your conversation or MindCache data exceeds the AI's context limit.
                    <div className="mt-1 text-red-300">
                      Try: reducing data in LLMRead keys, clearing some messages, or being more specific.
                    </div>
                  </div>
                );
              }
              if (msg.includes('"error"')) {
                const parsed = JSON.parse(msg);
                const apiError = parsed.error || parsed;
                return apiError.message || msg;
              }
              return msg;
            } catch {
              return error.message || 'An error occurred';
            }
          })()}
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-hidden mb-2">
          <div className="h-full overflow-y-auto p-2 border border-zinc-700 rounded bg-zinc-900/50">
            {messages.map((message) => (
              <div key={message.id} className="mb-3">
                <div className={`text-xs font-mono mb-1 ${message.role === 'user' ? 'text-cyan-400' : 'text-zinc-300'}`}>
                  {message.role === 'user' ? '< You' : '> Assistant'}
                </div>
                <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
                  {message.parts?.map((part, idx) => {
                    if (part.type === 'text' && 'text' in part) {
                      return <span key={idx}>{part.text}</span>;
                    }
                    if (part.type === 'tool-invocation' || part.type === 'tool-call') {
                      const toolName = 'toolName' in part ? (part as any).toolName : 'tool';
                      return (
                        <div key={idx} className="text-yellow-400 text-xs mt-1">
                          🔧 {toolName}
                        </div>
                      );
                    }
                    if (part.type === 'tool-result') {
                      const result = 'result' in part ? (part as any).result : null;
                      const resultText = typeof result === 'string'
                        ? result
                        : JSON.stringify(result);
                      return (
                        <div key={idx} className="text-green-500 text-xs mt-1">
                          ✅ {resultText && resultText.length > 80 ? resultText.substring(0, 80) + '...' : resultText}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything about your MindCache..."
            disabled={status !== 'ready'}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== 'ready'}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-sm font-mono transition-colors disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

