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
    },
    async onToolCall({ toolCall }) {
       console.log('🔧 Client intercepted tool call:', toolCall);
       const toolName = (toolCall as any).tool ?? (toolCall as any).toolName;
       const toolInput = (toolCall as any).input ?? (toolCall as any).args;

       console.log('🔧 Extracted:', { toolName, toolInput });
      
      // Execute tools client-side to maintain STM state
      if (typeof toolName === 'string' && toolName.startsWith('write_')) {
        const key = toolName.replace('write_', '');
        const value = (toolInput as any)?.value as string;
        
        mindcacheRef.current.set_value(key, value);
        
        // Notify parent component of tool call
        if (onToolCall) {
          onToolCall(toolCall);
        }
        
        // v5 API: add tool result with 'output'
        addToolResult({
          tool: toolName,
          toolCallId: (toolCall as any).toolCallId,
          output: {
            result: `Successfully wrote "${value}" to ${key}`,
            key,
            value,
          }
        });
        return;
      }

      // Handle other potential tools
      console.warn('Unknown tool:', toolName);
    }
  });

  const [input, setInput] = useState('');

  return (
    <div className="flex-1 flex flex-col mr-6">
      <div className="flex-1 overflow-y-auto p-4 border border-green-400 rounded mb-4 space-y-2">
        {messages.map((message) => (
          <div key={message.id} className="whitespace-pre-wrap">
            <span className={`font-bold ${message.role === 'user' ? 'text-green-400' : 'text-gray-400'}`}>
              {message.role === 'user' ? '> ' : '< '}
            </span>
            <span className={message.role === 'user' ? 'text-green-400' : 'text-gray-400'}>
              {message.parts?.map((part: any, index: number) => {
                if (part.type === 'text') {
                  return <span key={index}>{part.text}</span>;
                }
                if (part.type === 'tool-call') {
                  const name = (part as any).tool ?? (part as any).toolName;
                  return <span key={index} className="text-blue-400">[Tool: {name}]</span>;
                }
                if (part.type === 'tool-result') {
                  const result = (part as any).output ?? (part as any).result;
                  return <span key={index} className="text-green-500">[Result: {JSON.stringify(result)}]</span>;
                }
                return null;
              })}
            </span>
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="flex gap-2"
      >
        <input
          className="flex-1 bg-black text-green-400 font-mono border border-green-400 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-400 placeholder-green-600"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Tell me something to remember..."
        />
        <button 
          type="submit"
          disabled={status !== 'ready'}
          className="bg-green-400 text-black font-mono px-4 py-2 rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}
