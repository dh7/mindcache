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
      mindcacheRef.current.set_value('name', '', { default: 'Anonymous User' });
      mindcacheRef.current.set_value('preferences', '', { default: 'No preferences set' });
      mindcacheRef.current.set_value('notes', '', { default: 'No notes' });
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
        
        mindcacheRef.current.set_value(key, value);
        
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
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingAttributes, setEditingAttributes] = useState<string | null>(null);
  const [attributesForm, setAttributesForm] = useState({
    readonly: false,
    visible: true,
    default: '',
    hardcoded: false,
    template: false
  });

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
      mindcacheRef.current.set_value(key, '');
    }
  };

  // Delete an STM key
  const deleteSTMKey = (key: string) => {
    mindcacheRef.current.delete(key);
  };

  // Start editing a field
  const startEditing = (key: string, currentValue: any) => {
    setEditingKey(key);
    setEditingValue(typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : String(currentValue));
  };

  // Save edited value
  const saveEdit = () => {
    if (editingKey) {
      try {
        // Try to parse as JSON first, fall back to string
        let parsedValue;
        try {
          parsedValue = JSON.parse(editingValue);
        } catch {
          parsedValue = editingValue;
        }
        mindcacheRef.current.set_value(editingKey, parsedValue);
        setEditingKey(null);
        setEditingValue('');
      } catch (error) {
        console.error('Error saving edit:', error);
      }
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  // Start editing attributes
  const startEditingAttributes = (key: string) => {
    const attributes = mindcacheRef.current.get_attributes(key);
    if (attributes) {
      setAttributesForm(attributes);
    } else {
      // Default attributes for new keys
      setAttributesForm({
        readonly: false,
        visible: true,
        default: '',
        hardcoded: false,
        template: false
      });
    }
    setEditingAttributes(key);
  };

  // Save attributes
  const saveAttributes = () => {
    if (editingAttributes) {
      mindcacheRef.current.set_attributes(editingAttributes, attributesForm);
      setEditingAttributes(null);
    }
  };

  // Cancel attributes editing
  const cancelAttributes = () => {
    setEditingAttributes(null);
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
              {Object.entries(stmState).map(([key, value]) => {
                const isEmpty = !value || (typeof value === 'string' && value.trim() === '');
                const displayValue = isEmpty ? '_______' : (typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
                const attributes = mindcacheRef.current.get_attributes(key);
                const isSystemKey = key.startsWith('$');
                
                // Create property indicators
                const indicators = [];
                if (attributes) {
                  if (attributes.readonly) {
                    indicators.push('R');
                  }
                  if (!attributes.visible) {
                    indicators.push('V');
                  }
                  if (attributes.template) {
                    indicators.push('T');
                  }
                  if (attributes.hardcoded || isSystemKey) {
                    indicators.push('H');
                  }
                  if (attributes.default !== '') {
                    indicators.push('D');
                  }
                }
                
                return (
                  <div key={key} className="relative">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-gray-400 font-mono">{key}:</div>
                        {indicators.length > 0 && (
                          <div className="text-xs text-yellow-400 font-mono">
                            [{indicators.join('')}]
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEditingAttributes(key)}
                          className="text-green-600 hover:text-yellow-400 font-mono leading-none px-1"
                          title="Edit Properties"
                        >
                          ...
                        </button>
                        <button
                          onClick={() => deleteSTMKey(key)}
                          className="text-green-600 hover:text-red-400 font-mono leading-none"
                          title="Delete"
                        >
                          X
                        </button>
                      </div>
                    </div>
                    
                    {editingKey === key ? (
                      <div className="mt-1">
                        <textarea
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className="w-full bg-black text-green-400 font-mono px-2 py-1 focus:outline-none resize-none"
                          rows={Math.max(2, editingValue.split('\n').length)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.ctrlKey) {
                              saveEdit();
                            } else if (e.key === 'Escape') {
                              cancelEdit();
                            }
                          }}
                          autoFocus
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          Ctrl+Enter to save, Esc to cancel
                        </div>
                      </div>
                    ) : (
                      <div 
                        className={`break-words whitespace-pre-wrap cursor-pointer hover:bg-green-900 hover:bg-opacity-20 p-1 -m-1 font-mono ${isEmpty ? 'text-gray-500' : 'text-green-400'}`}
                        onClick={() => startEditing(key, value)}
                        title="Click to edit"
                      >
                        <span className="text-gray-400">{'>'}</span> {displayValue}
                      </div>
                    )}
                  </div>
                );
              })}
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

        {/* Property Indicators Legend */}
        <div className="mt-2 p-2 border border-gray-600 rounded text-xs">
          <div className="text-gray-400 mb-1">Property Indicators:</div>
          <div className="text-gray-500 space-y-0.5">
            <div><span className="text-yellow-400">[R]</span> Readonly</div>
            <div><span className="text-yellow-400">[V]</span> Hidden (not Visible)</div>
            <div><span className="text-yellow-400">[T]</span> Template</div>
            <div><span className="text-yellow-400">[H]</span> Hardcoded</div>
            <div><span className="text-yellow-400">[D]</span> Has Default</div>
          </div>
        </div>
      </div>

      {/* Attributes Editor Popup */}
      {editingAttributes && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              cancelAttributes();
            }
          }}
        >
          <div 
            className="bg-black border-2 border-green-400 rounded-lg p-6 w-96 max-w-full max-h-full overflow-auto"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                cancelAttributes();
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                saveAttributes();
              }
            }}
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-green-300 font-mono text-lg">Key Properties: {editingAttributes}</h3>
              <button
                onClick={cancelAttributes}
                className="text-green-600 hover:text-red-400 font-mono text-xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-2">
              {/* Readonly */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400 font-mono">readonly:</label>
                {attributesForm.hardcoded ? (
                  <span className="text-gray-500 font-mono px-2 py-1">
                    {attributesForm.readonly ? 'true' : 'false'}
                  </span>
                ) : (
                  <button
                    onClick={() => setAttributesForm({ ...attributesForm, readonly: !attributesForm.readonly })}
                    className="text-green-400 font-mono hover:bg-green-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                  >
                    {attributesForm.readonly ? 'true' : 'false'}
                  </button>
                )}
              </div>

              {/* Visible */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400 font-mono">visible:</label>
                <button
                  onClick={() => setAttributesForm({ ...attributesForm, visible: !attributesForm.visible })}
                  className="text-green-400 font-mono hover:bg-green-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                >
                  {attributesForm.visible ? 'true' : 'false'}
                </button>
              </div>

              {/* Template */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400 font-mono">template:</label>
                {attributesForm.hardcoded ? (
                  <span className="text-gray-500 font-mono px-2 py-1">
                    {attributesForm.template ? 'true' : 'false'}
                  </span>
                ) : (
                  <button
                    onClick={() => setAttributesForm({ ...attributesForm, template: !attributesForm.template })}
                    className="text-green-400 font-mono hover:bg-green-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                  >
                    {attributesForm.template ? 'true' : 'false'}
                  </button>
                )}
              </div>

              {/* Hardcoded */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400 font-mono">hardcoded:</label>
                <span className="text-gray-500 font-mono px-2 py-1">
                  {attributesForm.hardcoded ? 'true' : 'false'}
                </span>
              </div>

              {/* Default - only show if not a hardcoded property */}
              {!attributesForm.hardcoded && (
                <div className="flex flex-col space-y-2">
                  <label className="text-gray-400 font-mono">default:</label>
                  <textarea
                    value={attributesForm.default}
                    onChange={(e) => setAttributesForm({ ...attributesForm, default: e.target.value })}
                    className="bg-black text-green-400 font-mono border border-green-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-green-400 resize-none"
                    placeholder="Default value..."
                    rows={3}
                  />
                </div>
              )}
            </div>

            {/* Property Descriptions */}
            <div className="mt-6 p-3 border border-gray-600 rounded text-xs text-gray-500 space-y-1">
              <div><span className="text-green-400">readonly:</span> If true, won&apos;t appear in AI tools{attributesForm.hardcoded && ' (always true for hardcoded keys)'}</div>
              <div><span className="text-green-400">visible:</span> If false, hidden from injectSTM/getSTM</div>
              <div><span className="text-green-400">template:</span> Process with injectSTM on get{attributesForm.hardcoded && ' (always false for hardcoded keys)'}</div>
              {!attributesForm.hardcoded && (
                <div><span className="text-green-400">default:</span> Value restored on clear()</div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={saveAttributes}
                className="flex-1 bg-green-400 text-black font-mono px-4 py-2 rounded hover:bg-green-300"
              >
                Save
              </button>
              <button
                onClick={cancelAttributes}
                className="flex-1 border border-green-400 text-green-400 font-mono px-4 py-2 rounded hover:bg-green-900 hover:bg-opacity-20"
              >
                Cancel
              </button>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="mt-3 text-xs text-gray-500 text-center">
              Ctrl+Enter to save &bull; Esc to cancel &bull; Click outside to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
