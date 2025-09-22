'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, DefaultChatTransport } from 'ai';

import { useState, useCallback, useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';

export default function ClientSTMDemo() {
  const mindcacheRef = useRef(mindcache);
  
  // Initialize with some default keys to ensure tools are available
  useEffect(() => {
    const currentKeys = Object.keys(mindcacheRef.current.getAll());
    console.log('Current STM keys:', currentKeys);
    
    // Only count non-system keys (not starting with $)
    const userKeys = currentKeys.filter(key => !key.startsWith('$'));
    console.log('User keys:', userKeys);
    
    if (userKeys.length === 0) {
      console.log('Creating default STM keys...');
      mindcacheRef.current.set('name', '');
      mindcacheRef.current.set('preferences', '');
      mindcacheRef.current.set('notes', '');
      console.log('Created keys:', Object.keys(mindcacheRef.current.getAll()));
      // Force update the state
      setSTMState(mindcacheRef.current.getAll());
    }
  }, []);
  
  const [stmState, setSTMState] = useState(mindcacheRef.current.getAll());

  // Subscribe to STM changes to update UI
  const updateSTMState = useCallback(() => {
    setSTMState(mindcacheRef.current.getAll());
  }, []);

  // Subscribe to all STM changes on mount
  useEffect(() => {
    mindcacheRef.current.subscribeToAll(updateSTMState);
    return () => mindcacheRef.current.unsubscribeFromAll(updateSTMState);
  }, [updateSTMState]);

  const { messages, sendMessage, status, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat-client-stm',
      fetch: async (input, init) => {
        try {
          const originalBody = init?.body ? JSON.parse(init.body as string) : {};
          const nextBody = { ...originalBody, toolSchemas: getToolSchemas() };
          console.log('📤 Sending to server:', { toolSchemas: Object.keys(nextBody.toolSchemas || {}) });
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
        
        mindcacheRef.current.set(key, value);
        
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

  // Add a new STM key
  const addSTMKey = (key: string) => {
    if (key && !mindcacheRef.current.has(key)) {
      mindcacheRef.current.set(key, '');
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-6 flex">
      {/* Chat Interface */}
      <div className="flex-1 flex flex-col mr-6">
        <h2 className="text-xl mb-4 text-green-300">Client-Side STM Chat</h2>
        
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

      {/* STM State Panel */}
      <div className="w-80 flex flex-col">
        <h3 className="text-lg mb-4 text-green-300">STM State (Client-Side)</h3>
        
        {/* Add new key */}
        <div className="mb-4">
          <input
            className="w-full bg-black text-green-400 font-mono border border-green-400 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-400 placeholder-green-600"
            placeholder="New STM key..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                addSTMKey(e.currentTarget.value.trim());
                e.currentTarget.value = '';
              }
            }}
          />
        </div>

        {/* STM Display */}
        <div className="flex-1 border border-green-400 rounded p-4 overflow-y-auto">
          {Object.keys(stmState).length === 0 ? (
            <div className="text-gray-500">No STM data yet. Add a key above or chat to create memories.</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(stmState).map(([key, value]) => (
                <div key={key} className="border-b border-green-800 pb-2">
                  <div className="text-green-300 text-sm">{key}:</div>
                  <div className="text-green-400 ml-2 break-words">
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool Schemas Info */}
        <div className="mt-4 p-2 border border-gray-600 rounded text-xs">
          <div className="text-gray-400">Available Tools: {Object.keys(getToolSchemas()).length}</div>
          <div className="text-gray-500">
            {Object.keys(getToolSchemas()).map(tool => (
              <div key={tool}>• {tool}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
