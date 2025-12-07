'use client';

import { UIMessage } from '@ai-sdk/react';

interface MessagePart {
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  output?: unknown;
  result?: unknown;
  mediaType?: string;
  url?: string;
  filename?: string;
}

interface Message {
  id: string;
  role: string;
  parts?: MessagePart[];
}

interface ChatConversationProps {
  messages: UIMessage[];
}

export default function ChatConversation({ messages }: ChatConversationProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 border border-gray-600 rounded space-y-2 min-h-0 mb-2">
      {messages.map((message) => (
        <div key={message.id} className="whitespace-pre-wrap mb-4">
          <div className={`ml-2 font-mono text-sm ${message.role === 'user' ? 'text-cyan-400' : 'text-gray-400'}`}>
            {message.role === 'user' ? '< ' : '> '}
            {(message as unknown as Message).parts?.map((part: MessagePart, index: number) => {
              if (part.type === 'text') {
                return <span key={index} className="break-words">{part.text}</span>;
              }
              if (part.type === 'file') {
                return <div key={index} className="text-cyan-500 text-sm break-words">📷 {part.filename}</div>;
              }
              if (part.type === 'tool-call') {
                const toolPart = part as MessagePart & { tool?: string; toolName?: string };
                const name = toolPart.tool ?? toolPart.toolName;
                return <div key={index} className="text-yellow-400 text-sm break-words">🔧 {name}</div>;
              }
              if (part.type === 'tool-result') {
                const resultPart = part as MessagePart & { toolName?: string; output?: unknown; result?: unknown };
                const result = resultPart.output ?? resultPart.result;
                const resultText = JSON.stringify(result);
                return <div key={index} className="text-green-500 text-sm break-words">✅ {resultText.length > 50 ? resultText.substring(0, 50) + '...' : resultText}</div>;
              }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
