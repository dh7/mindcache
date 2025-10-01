'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';

// Type definitions
interface ToolSchema {
  description: string;
}

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
    template: false,
    type: 'text' as 'text' | 'image' | 'file' | 'json',
    contentType: '',
    tags: [] as string[]
  });
  const [editingKeyName, setEditingKeyName] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

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
  function getToolSchemas(): Record<string, ToolSchema> {
    const tools = mindcacheRef.current.get_aisdk_tools();
    const schemas: Record<string, ToolSchema> = {};
    
    // Convert tools to schema-only format
    Object.entries(tools).forEach(([toolName, tool]: [string, { description: string }]) => {
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

  // Handle file upload
  const handleFileUpload = async (key: string, file: File) => {
    try {
      await mindcacheRef.current.set_file(key, file);
      console.log(`✅ File uploaded to ${key}:`, file.name);
    } catch (error) {
      console.error('❌ Failed to upload file:', error);
      alert('Failed to upload file. Please try again.');
    }
  };


  // Delete an STM key
  const deleteSTMKey = (key: string) => {
    mindcacheRef.current.delete(key);
  };

  // Start editing a field
  const startEditing = (key: string, currentValue: unknown) => {
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
      setAttributesForm({
        readonly: attributes.readonly,
        visible: attributes.visible,
        default: attributes.default,
        hardcoded: attributes.hardcoded,
        template: attributes.template,
        type: attributes.type,
        contentType: attributes.contentType || '',
        tags: mindcacheRef.current.getTags(key)
      });
    } else {
      // Default attributes for new keys
      setAttributesForm({
        readonly: false,
        visible: true,
        default: '',
        hardcoded: false,
        template: false,
        type: 'text',
        contentType: '',
        tags: []
      });
    }
    setEditingAttributes(key);
    setEditingKeyName(key);
    setNewTagInput('');
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
        
        // Create new entry with new name (excluding tags from attributes)
        const { tags, ...attributesWithoutTags } = attributesForm;
        mindcacheRef.current.set_value(newKey, currentValue, attributesWithoutTags);
        
        // Set tags separately
        tags.forEach(tag => {
          mindcacheRef.current.addTag(newKey, tag);
        });
        
        // Delete old entry
        mindcacheRef.current.delete(oldKey);
      } else {
        // Just update attributes (excluding tags)
        const { tags, ...attributesWithoutTags } = attributesForm;
        mindcacheRef.current.set_attributes(oldKey, attributesWithoutTags);
        
        // Update tags - remove all existing tags and add new ones
        const existingTags = mindcacheRef.current.getTags(oldKey);
        existingTags.forEach(tag => {
          mindcacheRef.current.removeTag(oldKey, tag);
        });
        tags.forEach(tag => {
          mindcacheRef.current.addTag(oldKey, tag);
        });
      }
      
      setEditingAttributes(null);
      setEditingKeyName('');
      setNewTagInput('');
    }
  };

  // Cancel attributes editing
  const cancelAttributes = () => {
    setEditingAttributes(null);
    setEditingKeyName('');
    setNewTagInput('');
  };

  // Add a new tag
  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !attributesForm.tags.includes(trimmedTag)) {
      setAttributesForm({
        ...attributesForm,
        tags: [...attributesForm.tags, trimmedTag]
      });
    }
  };

  // Remove a tag
  const removeTag = (tagToRemove: string) => {
    setAttributesForm({
      ...attributesForm,
      tags: attributesForm.tags.filter(tag => tag !== tagToRemove)
    });
  };

  // Handle tag input
  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (newTagInput.trim()) {
        addTag(newTagInput);
        setNewTagInput('');
      }
    } else if (e.key === 'Backspace' && newTagInput === '' && attributesForm.tags.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      const lastTag = attributesForm.tags[attributesForm.tags.length - 1];
      removeTag(lastTag);
    }
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

  // Export STM to markdown file
  const exportSTM = () => {
    try {
      const markdown = mindcacheRef.current.toMarkdown();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindcache-export-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ STM exported to markdown');
    } catch (error) {
      console.error('❌ Failed to export STM:', error);
    }
  };

  // Import STM from markdown file
  const importSTM = () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,text/markdown';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const markdown = event.target?.result as string;
              mindcacheRef.current.fromMarkdown(markdown);
              updateSTMState(); // Refresh UI and notify listeners
              console.log('✅ STM imported from markdown');
            } catch (error) {
              console.error('❌ Failed to parse markdown:', error);
              alert('Failed to import markdown file. Please check the file format.');
            }
          };
          reader.onerror = () => {
            console.error('❌ Failed to read file');
            alert('Failed to read file.');
          };
          reader.readAsText(file);
        }
      };
      input.click();
    } catch (error) {
      console.error('❌ Failed to import STM:', error);
    }
  };

  return (
    <div className="flex-1 flex flex-col pl-1 min-h-0">
      {/* Terminal Commands - Fixed Header */}
      <div className="border border-green-400 rounded-t p-4 border-b-0 font-mono text-sm flex-shrink-0">
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
          <div 
            className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
            onClick={exportSTM}
            title="Export STM to markdown file"
          >
            Export
          </div>
          <div 
            className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
            onClick={importSTM}
            title="Import STM from markdown file"
          >
            Import
          </div>
        </div>
        <div className="text-xs text-gray-500 mb-4">
          Auto-loads on page refresh • Ctrl+S/L/K shortcuts • Export/Import as markdown
        </div>
        <div className="border-b border-green-400"></div>
      </div>

      {/* STM Content - Scrollable */}
      <div className="flex-1 border border-green-400 rounded-b p-4 overflow-y-auto min-h-0 border-t-0">

        {Object.keys(stmState).length === 0 ? (
          <div className="text-gray-500">No STM data yet. Use &quot;Add Key&quot; above or chat to create memories.</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(stmState).map(([key, value]) => {
              const isEmpty = !value || (typeof value === 'string' && value.trim() === '');
              const attributes = mindcacheRef.current.get_attributes(key);
              const isSystemKey = key.startsWith('$');
              const contentType = attributes?.type || 'text';
              
              // Handle different content types for display
              let displayValue = '';
              let isPreviewable = false;
              
              if (isEmpty) {
                displayValue = '_______';
              } else if (contentType === 'image') {
                const dataUrl = mindcacheRef.current.get_data_url(key);
                displayValue = `[IMAGE: ${attributes?.contentType || 'unknown'}]`;
                isPreviewable = !!dataUrl;
              } else if (contentType === 'file') {
                displayValue = `[FILE: ${attributes?.contentType || 'unknown'}]`;
                isPreviewable = false;
              } else if (contentType === 'json') {
                try {
                  displayValue = typeof value === 'string' ? JSON.stringify(JSON.parse(value), null, 2) : JSON.stringify(value, null, 2);
                } catch {
                  displayValue = String(value);
                }
              } else {
                displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
              }
              
              // Create property indicators
              const indicators = [];
              const tags = mindcacheRef.current.getTags(key);
              if (attributes) {
                // Add type indicator
                if (contentType !== 'text') {
                  indicators.push(contentType.toUpperCase().charAt(0));
                }
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-gray-400 font-mono">{key}:</div>
                      {indicators.length > 0 && (
                        <div className="text-xs text-yellow-400 font-mono">
                          [{indicators.join('')}]
                        </div>
                      )}
                      {tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {tags.map(tag => (
                            <span 
                              key={tag}
                              className="text-xs bg-blue-900 bg-opacity-50 text-blue-300 px-2 py-0.5 rounded font-mono border border-blue-600"
                            >
                              {tag}
                            </span>
                          ))}
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
                    <div className="mt-1">
                      <div 
                        className={`break-words whitespace-pre-wrap cursor-pointer hover:bg-green-900 hover:bg-opacity-20 p-1 -m-1 font-mono ${isEmpty ? 'text-gray-500' : 'text-green-400'}`}
                        onClick={() => {
                          if (contentType === 'image' || contentType === 'file') {
                            // Open file browser for image/file types
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = contentType === 'image' ? 'image/*' : '*/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                handleFileUpload(key, file);
                              }
                            };
                            input.click();
                          } else {
                            startEditing(key, value);
                          }
                        }}
                        title={contentType === 'image' || contentType === 'file' ? 'Click to upload new file' : 'Click to edit'}
                      >
                        <span className="text-gray-400">{'>'}</span> {displayValue}
                      </div>
                      
                      {/* Image preview */}
                      {contentType === 'image' && isPreviewable && (
                        <div className="mt-2 max-w-xs">
                          <img 
                            src={mindcacheRef.current.get_data_url(key)} 
                            alt={`Preview of ${key}`}
                            className="max-w-full h-auto border border-green-400 rounded"
                            style={{ maxHeight: '200px' }}
                          />
                        </div>
                      )}
                      
                      {/* File info */}
                      {(contentType === 'file' || contentType === 'image') && attributes?.contentType && (
                        <div className="mt-1 text-xs text-gray-500">
                          Type: {attributes.contentType}
                        </div>
                      )}
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

              {/* Type Selection */}
              <div className="flex flex-col space-y-2">
                <label className="text-gray-400 font-mono">type:</label>
                <select
                  value={attributesForm.type}
                  onChange={(e) => setAttributesForm({ 
                    ...attributesForm, 
                    type: e.target.value as 'text' | 'image' | 'file' | 'json',
                    // Clear contentType when switching to text/json
                    contentType: (e.target.value === 'text' || e.target.value === 'json') ? '' : attributesForm.contentType
                  })}
                  className="bg-black text-green-400 font-mono border border-green-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-green-400"
                >
                  <option value="text">text</option>
                  <option value="json">json</option>
                  <option value="image">image</option>
                  <option value="file">file</option>
                </select>
              </div>

              {/* Upload Button - only for image/file */}
              {(attributesForm.type === 'image' || attributesForm.type === 'file') && (
                <div className="flex flex-col space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = attributesForm.type === 'image' ? 'image/*' : '*/*';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file && editingKeyName) {
                          try {
                            // Update content type from file
                            setAttributesForm({ 
                              ...attributesForm, 
                              contentType: file.type,
                              type: file.type.startsWith('image/') ? 'image' : 'file'
                            });
                            
                            // Upload the file
                            await handleFileUpload(editingKeyName, file);
                            console.log(`✅ File uploaded via popup: ${file.name}`);
                          } catch (error) {
                            console.error('❌ Failed to upload file from popup:', error);
                            alert('Failed to upload file. Please try again.');
                          }
                        }
                      };
                      input.click();
                    }}
                    className="border border-green-400 text-green-400 font-mono px-3 py-2 rounded hover:bg-green-900 hover:bg-opacity-20 transition-colors"
                  >
                    Upload {attributesForm.type === 'image' ? 'Image' : 'File'}
                  </button>
                </div>
              )}
              {/* Readonly */}
              <div className="flex items-center justify-between">
                <div className="text-gray-400 font-mono">
                  <span className="text-yellow-400">[R]</span> readonly:
                  <div className="text-xs text-gray-500 mt-1">If true, won&apos;t appear in AI tools</div>
                </div>
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
                <div className="text-gray-400 font-mono">
                  <span className="text-yellow-400">[V]</span> visible:
                  <div className="text-xs text-gray-500 mt-1">If false, hidden from injectSTM/getSTM</div>
                </div>
                <button
                  onClick={() => setAttributesForm({ ...attributesForm, visible: !attributesForm.visible })}
                  className="text-green-400 font-mono hover:bg-green-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                >
                  {attributesForm.visible ? 'true' : 'false'}
                </button>
              </div>

              {/* Template */}
              <div className="flex items-center justify-between">
                <div className="text-gray-400 font-mono">
                  <span className="text-yellow-400">[T]</span> template:
                  <div className="text-xs text-gray-500 mt-1">Process with injectSTM on get</div>
                </div>
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
                <div className="text-gray-400 font-mono">
                  <span className="text-yellow-400">[H]</span> hardcoded:
                </div>
                <span className="text-gray-500 font-mono px-2 py-1">
                  {attributesForm.hardcoded ? 'true' : 'false'}
                </span>
              </div>

              {/* Default - only show if not a hardcoded property */}
              {!attributesForm.hardcoded && (
                <div className="flex flex-col space-y-2">
                  <div className="text-gray-400 font-mono">
                    <span className="text-yellow-400">[D]</span> default:
                    <div className="text-xs text-gray-500 mt-1">Value restored on clear()</div>
                  </div>
                  
                  {/* Image/File default handling */}
                  {(attributesForm.type === 'image' || attributesForm.type === 'file') ? (
                    <div className="space-y-2">
                      {attributesForm.default ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-mono text-sm">
                            Default {attributesForm.type} set
                          </span>
                          <button
                            onClick={() => setAttributesForm({ ...attributesForm, default: '' })}
                            className="text-red-400 hover:text-red-300 font-mono text-sm px-2 py-1 border border-red-400 rounded transition-colors"
                          >
                            Remove Default
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (editingKeyName && mindcacheRef.current.has(editingKeyName)) {
                              const currentValue = mindcacheRef.current.get_value(editingKeyName);
                              if (currentValue) {
                                setAttributesForm({ ...attributesForm, default: currentValue });
                              } else {
                                alert(`No ${attributesForm.type} data to set as default. Upload a ${attributesForm.type} first.`);
                              }
                            }
                          }}
                          className="text-green-400 hover:text-green-300 font-mono text-sm px-3 py-2 border border-green-400 rounded transition-colors"
                        >
                          Set Current as Default
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Text/JSON default handling */
                    <textarea
                      value={attributesForm.default}
                      onChange={(e) => setAttributesForm({ ...attributesForm, default: e.target.value })}
                      className="bg-black text-green-400 font-mono border border-green-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-green-400 resize-none"
                      placeholder="Default value..."
                      rows={3}
                    />
                  )}
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-col space-y-2">
                <div className="text-gray-400 font-mono">
                  tags:
                </div>
                
                {/* Tag display and input */}
                <div className="bg-black border border-green-400 rounded px-2 py-2 focus-within:ring-1 focus-within:ring-green-400">
                  <div className="flex flex-wrap gap-1 items-center">
                    {/* Existing tags */}
                    {attributesForm.tags.map((tag, index) => (
                      <span 
                        key={index}
                        className="inline-flex items-center gap-1 text-xs bg-blue-900 bg-opacity-50 text-blue-300 px-2 py-1 rounded font-mono border border-blue-600 group hover:bg-blue-800 hover:bg-opacity-50 transition-colors"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="text-blue-400 hover:text-red-400 ml-1 leading-none"
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    
                    {/* Tag input */}
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={handleTagInput}
                      className="bg-transparent text-green-400 font-mono focus:outline-none flex-1 min-w-0"
                      placeholder={attributesForm.tags.length === 0 ? "Add tags..." : ""}
                      style={{ minWidth: '80px' }}
                    />
                  </div>
                </div>
                
                {/* Tag suggestions or help */}
                <div className="text-xs text-gray-500">
                  {attributesForm.tags.length > 0 && (
                    <div>
                      Use getTagged(&quot;{attributesForm.tags[0]}&quot;)
                    </div>
                  )}
                </div>
              </div>
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
