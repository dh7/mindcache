'use client';

import { useChat, UIMessage } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

interface ToolSchema {
  description: string;
}

interface MessagePart {
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  output?: unknown;
  result?: unknown;
  // File part properties
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

interface ChatInterfaceProps {
  onToolCall?: (toolCall: TypedToolCall<ToolSet>) => Promise<any> | void;
  initialMessages?: UIMessage[];
  workflowPrompt?: string;
  onWorkflowPromptSent?: () => void;
  onStatusChange?: (status: string) => void;
}

export default function ChatInterface({ onToolCall, initialMessages, workflowPrompt, onWorkflowPromptSent, onStatusChange }: ChatInterfaceProps) {
  const mindcacheRef = useRef(mindcache);
  
  
  // Generate tool schemas (without execute functions) for the server
  function getToolSchemas(): Record<string, ToolSchema> {
    const tools = mindcacheRef.current.get_aisdk_tools();
    const schemas: Record<string, ToolSchema> = {};
    
    console.log('🔧 Generated tools on client:', Object.keys(tools));
    
    // Convert tools to schema-only format
    Object.entries(tools).forEach(([toolName, tool]: [string, { description: string }]) => {
      schemas[toolName] = {
        description: tool.description,
        // Server will recreate the Zod schema
      };
    });


    console.log('📤 Sending tool schemas to server:', Object.keys(schemas));
    return schemas;
  }

  const { messages, sendMessage, status, addToolResult } = useChat({
    messages: initialMessages,
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
      console.log('🏁 Message parts:', (message as Message).parts);
      
      // Extract and log sources from web search results
      const parts = (message as Message).parts || [];
      const toolResults = parts.filter((part: MessagePart) => part.type === 'tool-result');
      const webSearchResults = toolResults.filter((result: MessagePart) => 
        result.toolName === 'web_search' && (result.result as { sources?: WebSearchSource[] })?.sources
      );
      
      if (webSearchResults.length > 0) {
        console.log('🔍 Web search sources:', webSearchResults.map((r: MessagePart) => (r.result as { sources: WebSearchSource[] }).sources));
      }
    },
    async onToolCall({ toolCall }) {
       console.log('🔧 Client intercepted tool call:', toolCall);
       const typedToolCall = toolCall as TypedToolCall<ToolSet>;
       const toolName = typedToolCall.toolName;
       const toolInput = typedToolCall.input;

       console.log('🔧 Extracted:', { toolName, toolInput });
      
      // Execute tools client-side to maintain STM state
      if (typeof toolName === 'string' && toolName.startsWith('write_')) {
        const value = (toolInput as Record<string, unknown>)?.value as string;
        
        // Execute the tool call using the centralized method
        const result = mindcacheRef.current.executeToolCall(toolName, value);
        
        // Notify parent component of tool call
        if (onToolCall) {
          onToolCall(typedToolCall);
        }
        
        // v5 API: add tool result with 'output'
        if (result) {
          addToolResult({
            tool: toolName,
            toolCallId: typedToolCall.toolCallId,
            output: result
          });
        } else {
          console.warn('Failed to execute tool call:', toolName);
        }
        return;
      }

      // Handle generate_image tool
      if (toolName === 'generate_image') {
        console.log('🖼️ Handling generate_image tool call');
        
        // Notify parent component and get result
        if (onToolCall) {
          const result = await onToolCall(typedToolCall);
          
          // Add tool result
          addToolResult({
            tool: toolName,
            toolCallId: typedToolCall.toolCallId,
            output: result
          });
        } else {
          console.warn('No onToolCall handler for generate_image');
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

  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  // Handle workflow prompts
  useEffect(() => {
    if (workflowPrompt && status === 'ready') {
      // Send the workflow prompt
      const imageParts = mindcacheRef.current.getVisibleImages();
      
      const messageParts = [
        { type: 'text' as const, text: workflowPrompt },
        ...imageParts
      ];

      sendMessage({
        role: 'user',
        parts: messageParts as any
      });
      
      // Immediately notify that the prompt was sent to clear the workflowPrompt
      if (onWorkflowPromptSent) {
        onWorkflowPromptSent();
      }
    }
  }, [workflowPrompt, status, sendMessage, onWorkflowPromptSent]);

  // Helper function to render message with citations
  const renderMessageContent = (message: Message) => {
    const parts = message.parts || [];
    let content = '';
    let sources: WebSearchSource[] = [];

    // Extract text content and sources
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
    <div className="flex-1 flex flex-col pr-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-4 border border-green-400 rounded mb-4 space-y-2 min-h-0">
        {messages.map((message) => {
          const { sources } = renderMessageContent(message);
          return (
            <div key={message.id} className="whitespace-pre-wrap mb-4">
              <div className={`ml-2 ${message.role === 'user' ? 'text-green-400' : 'text-gray-400'}`}>
                {message.role === 'user' ? '< ' : '> '}
                {message.parts?.map((part: MessagePart, index: number) => {
                  if (part.type === 'text') {
                    return <span key={index} className="break-words">{part.text}</span>;
                  }
                  if (part.type === 'file') {
                    // Display an image icon, and the name of the image
                    return <div key={index} className="text-green-500 text-sm break-words">📷 {part.filename}</div>;
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
                      return null; // Web search results are handled via sources
                    }
                    const result = resultPart.output ?? resultPart.result;
                    const resultText = JSON.stringify(result);
                    return <div key={index} className="text-green-500 text-sm break-words">✅ {resultText.length > 50 ? resultText.substring(0, 50) + '...' : resultText}</div>;
                  }
                  return null;
                })}
                
                {/* Display citations if available */}
                {sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-green-600">
                    <div className="text-green-300 text-sm font-semibold mb-2">📚 Sources:</div>
                    {sources.map((source: WebSearchSource, index: number) => (
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
            // Get visible images from STM using the core library method
            const imageParts = mindcacheRef.current.getVisibleImages();
            
            // Create message with text and image parts
            const messageParts = [
              { type: 'text' as const, text: input },
              ...imageParts
            ];

            // 🐛 DEBUG: Log the complete UIMessage structure
            console.log('🔍 DEBUG: Sending UIMessage:', {
              role: 'user',
              parts: messageParts,
              totalParts: messageParts.length,
              textParts: messageParts.filter(p => p.type === 'text').length,
              imageParts: messageParts.filter(p => p.type === 'file').length
            });

            // 🐛 DEBUG: Log image details
            imageParts.forEach((part, index) => {
              const dataUrlSize = part.url.length;
              const base64Size = part.url.split(',')[1]?.length || 0;
              const estimatedKB = Math.round(base64Size * 0.75 / 1024); // Base64 to bytes conversion
              
              console.log(`🖼️ DEBUG: Image ${index + 1} (${part.filename}):`, {
                mediaType: part.mediaType,
                dataUrlLength: dataUrlSize,
                base64Length: base64Size,
                estimatedSizeKB: estimatedKB,
                urlPreview: part.url.substring(0, 100) + '...'
              });
            });

            // 🐛 DEBUG: Calculate total message size
            const totalMessageSize = JSON.stringify(messageParts).length;
            console.log('📊 DEBUG: Total message size:', {
              totalCharacters: totalMessageSize,
              estimatedKB: Math.round(totalMessageSize / 1024),
              estimatedTokens: Math.round(totalMessageSize / 4) // Rough token estimation
            });
            
            sendMessage({
              role: 'user',
              parts: messageParts as any // Type assertion needed for AI SDK compatibility
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
          placeholder={isLoading ? "AI is thinking..." : "Ask something..."}
        />
        <button 
          type="submit"
          disabled={status !== 'ready' || !input.trim()}
          className="bg-green-400 text-black font-mono px-2 py-2 text-sm rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </form>
      
    </div>
  );
}
