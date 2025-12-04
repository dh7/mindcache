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

interface WebSearchSource {
  url: string;
  title?: string;
  snippet?: string;
}

interface ChatConversationProps {
  messages: UIMessage[];
}

export default function ChatConversation({ messages }: ChatConversationProps) {
  const renderMessageContent = (message: Message) => {
    const parts = message.parts || [];
    let content = '';
    let sources: WebSearchSource[] = [];

    parts.forEach((part: MessagePart) => {
      if (part.type === 'text') {
        content += part.text || '';
      } else if (part.type === 'tool-result' && part.toolName === 'web_search') {
        const result = part.result as { sources?: WebSearchSource[] };
        if (result?.sources) {
          sources = [...sources, ...result.sources];
        }
      }
    });

    return { content, sources };
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 border border-gray-600 rounded space-y-2 min-h-0 mb-2">
      {messages.map((message) => {
        const { sources } = renderMessageContent(message);
        return (
          <div key={message.id} className="whitespace-pre-wrap mb-4">
            <div className={`ml-2 font-mono text-sm ${message.role === 'user' ? 'text-cyan-400' : 'text-gray-400'}`}>
              {message.role === 'user' ? '< ' : '> '}
              {message.parts?.map((part: MessagePart, index: number) => {
                if (part.type === 'text') {
                  return <span key={index} className="break-words">{part.text}</span>;
                }
                if (part.type === 'file') {
                  return <div key={index} className="text-cyan-500 text-sm break-words">📷 {part.filename}</div>;
                }
                if (part.type === 'tool-call') {
                  const toolPart = part as MessagePart & { tool?: string; toolName?: string };
                  const name = toolPart.tool ?? toolPart.toolName;
                  if (name === 'web_search') {
                    return <div key={index} className="text-blue-400 text-sm break-words">🔍 Searching...</div>;
                  }
                  return <div key={index} className="text-yellow-400 text-sm break-words">🔧 {name}</div>;
                }
                if (part.type === 'tool-result') {
                  const resultPart = part as MessagePart & { toolName?: string; output?: unknown; result?: unknown };
                  const name = resultPart.toolName;
                  if (name === 'web_search') {
                    return null;
                  }
                  const result = resultPart.output ?? resultPart.result;
                  const resultText = JSON.stringify(result);
                  return <div key={index} className="text-cyan-500 text-sm break-words">✅ {resultText.length > 50 ? resultText.substring(0, 50) + '...' : resultText}</div>;
                }
                return null;
              })}
              
              {sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-cyan-600">
                  <div className="text-cyan-300 text-sm font-semibold mb-2">📚 Sources:</div>
                  {sources.map((source: WebSearchSource, index: number) => (
                    <div key={index} className="text-cyan-500 text-xs mb-2">
                      <span className="text-cyan-300">[{index + 1}]</span>{' '}
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline hover:text-cyan-300 transition-colors"
                      >
                        {source.title || source.url}
                      </a>
                      {source.snippet && (
                        <div className="text-cyan-600 ml-4 italic mt-1">
                          &quot;{source.snippet.length > 100 ? source.snippet.substring(0, 100) + '...' : source.snippet}&quot;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

