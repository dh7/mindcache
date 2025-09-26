'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, DefaultChatTransport } from 'ai';
import { useState, useRef } from 'react';
import { mindcache } from 'mindcache';

interface ChatInterfaceProps {
  onToolCall?: (toolCall: any) => void;
}

export default function ChatInterface({ onToolCall }: ChatInterfaceProps) {
  const mindcacheRef = useRef(mindcache);
  
  // Generate tool schemas (without execute functions) for the server
  function getToolSchemas() {
    const tools = mindcacheRef.current.get_aisdk_tools();
    const schemas: Record<string, any> = {};
    
    console.log('🔧 Generated tools on client:', Object.keys(tools));
    
    // Convert tools to schema-only format
    Object.entries(tools).forEach(([toolName, tool]: [string, any]) => {
      schemas[toolName] = {
        description: tool.description,
        // Server will recreate the Zod schema
      };
    });

    console.log('📤 Sending tool schemas to server:', Object.keys(schemas));
    return schemas;
  }

  const { messages, sendMessage, status, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat-client-stm',
      fetch: async (input, init) => {
        try {
          const originalBody = init?.body ? JSON.parse(init.body as string) : {};
          const systemPrompt = mindcacheRef.current.get_system_prompt();
          const nextBody = { ...originalBody, toolSchemas: getToolSchemas(), systemPrompt };
          console.log('📤 Sending to server:', { toolSchemas: Object.keys(nextBody.toolSchemas || {}), hasSystemPrompt: Boolean(systemPrompt) });
          return fetch(input, { ...init, body: JSON.stringify(nextBody) });
        } catch {
          return fetch(input, init);
        }
      },
    }),
    // Auto-submit when all tool calls are complete
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ message }) => {
      console.log('🏁 Message finished:', message);
      console.log('🏁 Message parts:', (message as any).parts);
      
      // Extract and log sources from web search results
      const parts = (message as any).parts || [];
      const toolResults = parts.filter((part: any) => part.type === 'tool-result');
      const webSearchResults = toolResults.filter((result: any) => 
        result.toolName === 'web_search' && result.result?.sources
      );
      
      if (webSearchResults.length > 0) {
        console.log('🔍 Web search sources:', webSearchResults.map((r: any) => r.result.sources));
      }
    },
    async onToolCall({ toolCall }) {
       console.log('🔧 Client intercepted tool call:', toolCall);
       const toolName = (toolCall as any).tool ?? (toolCall as any).toolName;
       const toolInput = (toolCall as any).input ?? (toolCall as any).args;

       console.log('🔧 Extracted:', { toolName, toolInput });
      
      // Execute tools client-side to maintain STM state
      if (typeof toolName === 'string' && toolName.startsWith('write_')) {
        const value = (toolInput as any)?.value as string;
        
        // Execute the tool call using the centralized method
        const result = mindcacheRef.current.executeToolCall(toolName, value);
        
        // Notify parent component of tool call
        if (onToolCall) {
          onToolCall(toolCall);
        }
        
        // v5 API: add tool result with 'output'
        if (result) {
          addToolResult({
            tool: toolName,
            toolCallId: (toolCall as any).toolCallId,
            output: result
          });
        } else {
          console.warn('Failed to execute tool call:', toolName);
        }
        return;
      }

      // Handle other potential tools
      console.warn('Unknown tool:', toolName);
    }
  });

  const [input, setInput] = useState('');
  
  // Track loading state based on status
  const isLoading = status !== 'ready';

  // Helper function to render message with citations
  const renderMessageContent = (message: any) => {
    const parts = message.parts || [];
    let content = '';
    let sources: any[] = [];

    // Extract text content and sources
    parts.forEach((part: any) => {
      if (part.type === 'text') {
        content += part.text;
      } else if (part.type === 'tool-result' && part.toolName === 'web_search') {
        if (part.result?.sources) {
          sources = [...sources, ...part.result.sources];
        }
      }
    });

    return { content, sources };
  };

  return (
    <div className="flex-1 flex flex-col mr-6">
      <div className="flex-1 overflow-y-auto p-4 border border-green-400 rounded mb-4 space-y-2">
        {messages.map((message) => {
          const { sources } = renderMessageContent(message);
          return (
            <div key={message.id} className="whitespace-pre-wrap mb-4">
              <div className={`ml-2 ${message.role === 'user' ? 'text-green-400' : 'text-gray-400'}`}>
                {message.role === 'user' ? '< ' : '> '}
                {message.parts?.map((part: any, index: number) => {
                  if (part.type === 'text') {
                    return <span key={index}>{part.text}</span>;
                  }
                  if (part.type === 'tool-call') {
                    const name = (part as any).tool ?? (part as any).toolName;
                    if (name === 'web_search') {
                      return <div key={index} className="text-blue-400 text-sm">🔍 Searching the web...</div>;
                    }
                    return <div key={index} className="text-yellow-400 text-sm">🔧 Tool: {name}</div>;
                  }
                  if (part.type === 'tool-result') {
                    const name = (part as any).toolName;
                    if (name === 'web_search') {
                      return null; // Web search results are handled via sources
                    }
                    const result = (part as any).output ?? (part as any).result;
                    return <div key={index} className="text-green-500 text-sm">✅ {JSON.stringify(result)}</div>;
                  }
                  return null;
                })}
                
                {/* Display citations if available */}
                {sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-green-600">
                    <div className="text-green-300 text-sm font-semibold mb-2">📚 Sources:</div>
                    {sources.map((source: any, index: number) => (
                      <div key={index} className="text-green-500 text-xs mb-2">
                        <span className="text-green-300">[{index + 1}]</span>{' '}
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="underline hover:text-green-300 transition-colors"
                        >
                          {source.title || source.url}
                        </a>
                        {source.snippet && (
                          <div className="text-green-600 ml-4 italic mt-1">
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

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim() && status === 'ready') {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="flex gap-2"
      >
        <input
          className="flex-1 bg-black text-green-400 font-mono border border-green-400 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-400 placeholder-green-600 disabled:opacity-50"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          placeholder={isLoading ? "AI is thinking..." : "Ask something time-sensitive..."}
        />
        <button 
          type="submit"
          disabled={status !== 'ready' || !input.trim()}
          className="bg-green-400 text-black font-mono px-4 py-2 rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? ' ... ' : 'Send'}
        </button>
      </form>
      
    </div>
  );
}
