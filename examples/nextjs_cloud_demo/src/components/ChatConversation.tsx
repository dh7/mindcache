'use client';

import { Message } from 'ai';

interface ChatConversationProps {
  messages: Message[];
}

export default function ChatConversation({ messages }: ChatConversationProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 border border-gray-600 rounded space-y-2 min-h-0 mb-2">
      {messages.map((message) => (
        <div key={message.id} className="whitespace-pre-wrap mb-4">
          <div className={`ml-2 font-mono text-sm ${message.role === 'user' ? 'text-cyan-400' : 'text-gray-400'}`}>
            {message.role === 'user' ? '< ' : '> '}
            <span className="break-words">{message.content}</span>
            
            {/* Show tool invocations if any */}
            {message.toolInvocations?.map((tool, idx) => (
              <div key={idx} className="text-yellow-400 text-xs mt-1">
                🔧 {tool.toolName}: {tool.state === 'result' ? '✅' : '⏳'}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
