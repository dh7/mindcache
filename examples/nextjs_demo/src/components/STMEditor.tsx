'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';

interface STMEditorProps {
  onSTMChange?: () => void;
}

export default function STMEditor({ onSTMChange }: STMEditorProps) {
  const mindcacheRef = useRef(mindcache);
  const [stmState, setSTMState] = useState(mindcacheRef.current.getAll());
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
  const [editingKeyName, setEditingKeyName] = useState('');

  // Subscribe to STM changes to update UI
  const updateSTMState = useCallback(() => {
    setSTMState(mindcacheRef.current.getAll());
    if (onSTMChange) {
      onSTMChange();
    }
  }, [onSTMChange]);

  // Subscribe to all STM changes on mount
  useEffect(() => {
    mindcacheRef.current.subscribeToAll(updateSTMState);
    return () => mindcacheRef.current.unsubscribeFromAll(updateSTMState);
  }, [updateSTMState]);

  // Global keyboard shortcuts for terminal commands
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            saveSTM();
            break;
          case 'l':
            e.preventDefault();
            loadSTM();
            break;
          case 'k':
            e.preventDefault();
            if (confirm('Clear STM? This will restore default values.')) {
              clearSTM();
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Generate tool schemas (without execute functions) for display
  function getToolSchemas() {
    const tools = mindcacheRef.current.get_aisdk_tools();
    const schemas: Record<string, any> = {};
    
    // Convert tools to schema-only format
    Object.entries(tools).forEach(([toolName, tool]: [string, any]) => {
      schemas[toolName] = {
        description: tool.description,
      };
    });

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
    setEditingKeyName(key);
  };

  // Save attributes
  const saveAttributes = () => {
    if (editingAttributes) {
      const oldKey = editingAttributes;
      const newKey = editingKeyName.trim();
      
      // If key name changed, we need to create new entry and delete old one
      if (newKey && newKey !== oldKey) {
        // Don't allow renaming to existing key or system keys
        if (mindcacheRef.current.has(newKey) || newKey.startsWith('$')) {
          alert(`Key "${newKey}" already exists or is a system key`);
          return;
        }
        
        // Get current value
        const currentValue = mindcacheRef.current.get_value(oldKey);
        
        // Create new entry with new name
        mindcacheRef.current.set_value(newKey, currentValue, attributesForm);
        
        // Delete old entry
        mindcacheRef.current.delete(oldKey);
      } else {
        // Just update attributes
        mindcacheRef.current.set_attributes(oldKey, attributesForm);
      }
      
      setEditingAttributes(null);
      setEditingKeyName('');
    }
  };

  // Cancel attributes editing
  const cancelAttributes = () => {
    setEditingAttributes(null);
    setEditingKeyName('');
  };

  // Save STM to localStorage
  const saveSTM = () => {
    try {
      const serialized = mindcacheRef.current.toJSON();
      localStorage.setItem('mindcache_stm', serialized);
      console.log('✅ STM saved to localStorage');
    } catch (error) {
      console.error('❌ Failed to save STM:', error);
    }
  };

  // Load STM from localStorage
  const loadSTM = () => {
    try {
      const saved = localStorage.getItem('mindcache_stm');
      if (saved) {
        mindcacheRef.current.fromJSON(saved);
        console.log('✅ STM loaded from localStorage');
      } else {
        console.log('ℹ️ No saved STM found');
      }
    } catch (error) {
      console.error('❌ Failed to load STM:', error);
    }
  };

  // Clear STM
  const clearSTM = () => {
    mindcacheRef.current.clear();
    console.log('🗑️ STM cleared');
  };

  return (
    <div className="flex-1 flex flex-col pl-1 min-h-0">
      {/* STM Display */}
      <div className="flex-1 border border-green-400 rounded p-4 overflow-y-auto min-h-0">
        {/* Terminal Commands */}
        <div className="mb-4 pb-3 border-b border-green-400 font-mono text-sm">
          <div className="flex space-x-4 mb-2">
            <div 
              className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
              onClick={() => {
                const key = prompt('Enter new STM key:');
                if (key && key.trim()) {
                  addSTMKey(key.trim());
                }
              }}
              title="Add new STM key"
            >
              Add Key
            </div>
            <div 
              className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
              onClick={loadSTM}
              title="Load STM from localStorage (Ctrl+L)"
            >
              Load
            </div>
            <div 
              className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
              onClick={saveSTM}
              title="Save STM to localStorage (Ctrl+S)"
            >
              Save
            </div>
            <div 
              className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
              onClick={() => {
                if (confirm('Clear STM? This will restore default values.')) {
                  clearSTM();
                }
              }}
              title="Clear STM - keeps defaults (Ctrl+K)"
            >
              Clear
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Auto-loads on page refresh • Ctrl+S/L/K shortcuts
          </div>
        </div>

        {Object.keys(stmState).length === 0 ? (
          <div className="text-gray-500">No STM data yet. Use &quot;Add Key&quot; above or chat to create memories.</div>
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
              <h3 className="text-green-300 font-mono text-lg">Key Properties</h3>
              <button
                onClick={cancelAttributes}
                className="text-green-600 hover:text-red-400 font-mono text-xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-2">
              {/* Key Name */}
              <div className="flex flex-col space-y-2">
                <label className="text-gray-400 font-mono">key name:</label>
                <input
                  type="text"
                  value={editingKeyName}
                  onChange={(e) => setEditingKeyName(e.target.value)}
                  className="bg-black text-green-400 font-mono border border-green-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-green-400"
                  placeholder="Key name..."
                />
              </div>
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
