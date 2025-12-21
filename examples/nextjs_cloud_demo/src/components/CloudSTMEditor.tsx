'use client';

import { useState, useCallback, useEffect } from 'react';
import { MindCache, KeyType } from 'mindcache';

interface CloudSTMEditorProps {
  onSTMChange?: () => void;
  selectedTags?: string[];
  mindcacheInstance: MindCache;
}

export default function CloudSTMEditor({ onSTMChange, selectedTags, mindcacheInstance }: CloudSTMEditorProps) {
  const [stmState, setSTMState] = useState(mindcacheInstance.getAll());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingAttributes, setEditingAttributes] = useState<string | null>(null);
  const [attributesForm, setAttributesForm] = useState({
    readonly: false,
    visible: true,
    hardcoded: false,
    template: false,
    type: 'text' as KeyType,
    contentType: '',
    tags: [] as string[]
  });
  const [editingKeyName, setEditingKeyName] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const updateSTMState = useCallback(() => {
    setSTMState(mindcacheInstance.getAll());
    if (onSTMChange) {
      onSTMChange();
    }
  }, [onSTMChange, mindcacheInstance]);

  useEffect(() => {
    mindcacheInstance.subscribeToAll(updateSTMState);
    return () => mindcacheInstance.unsubscribeFromAll(updateSTMState);
  }, [updateSTMState, mindcacheInstance]);

  const handleFileUpload = async (key: string, file: File) => {
    try {
      await mindcacheInstance.set_file(key, file);
      console.log(`✅ File uploaded to ${key}:`, file.name);
    } catch (error) {
      console.error('❌ Failed to upload file:', error);
      alert('Failed to upload file. Please try again.');
    }
  };

  const deleteSTMKey = (key: string) => {
    mindcacheInstance.delete_key(key);
  };

  const startEditing = (key: string, currentValue: unknown) => {
    setEditingKey(key);
    setEditingValue(typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : String(currentValue));
  };

  const saveEdit = () => {
    if (editingKey) {
      try {
        let parsedValue;
        try {
          parsedValue = JSON.parse(editingValue);
        } catch {
          parsedValue = editingValue;
        }
        mindcacheInstance.set_value(editingKey, parsedValue);
        setEditingKey(null);
        setEditingValue('');
      } catch (error) {
        console.error('Error saving edit:', error);
      }
    }
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  const startEditingAttributes = (key: string) => {
    const attributes = mindcacheInstance.get_attributes(key);
    if (attributes) {
      setAttributesForm({
        readonly: attributes.readonly,
        visible: attributes.visible,
        hardcoded: attributes.hardcoded,
        template: attributes.template,
        type: attributes.type || 'text',
        contentType: attributes.contentType || '',
        tags: mindcacheInstance.getTags(key)
      });
    } else {
      setAttributesForm({
        readonly: false,
        visible: true,
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

  const saveAttributes = () => {
    if (editingAttributes) {
      const finalTags = [...attributesForm.tags];
      const pendingTag = newTagInput.trim();
      if (pendingTag && !finalTags.includes(pendingTag)) {
        finalTags.push(pendingTag);
      }

      const oldKey = editingAttributes;
      const newKey = editingKeyName.trim();

      if (newKey && newKey !== oldKey) {
        if (mindcacheInstance.has(newKey) || newKey.startsWith('$')) {
          alert(`Key "${newKey}" already exists or is a system key`);
          return;
        }

        const currentValue = mindcacheInstance.get_value(oldKey);
        const { tags: _, ...attributesWithoutTags } = attributesForm;
        void _;
        mindcacheInstance.set_value(newKey, currentValue, attributesWithoutTags);

        finalTags.forEach(tag => {
          mindcacheInstance.addTag(newKey, tag);
        });

        mindcacheInstance.delete(oldKey);
      } else {
        const { tags: _, ...attributesWithoutTags } = attributesForm;
        void _;
        mindcacheInstance.set_attributes(oldKey, attributesWithoutTags);

        const existingTags = mindcacheInstance.getTags(oldKey);
        existingTags.forEach(tag => {
          mindcacheInstance.removeTag(oldKey, tag);
        });
        finalTags.forEach(tag => {
          mindcacheInstance.addTag(oldKey, tag);
        });
      }

      setEditingAttributes(null);
      setEditingKeyName('');
      setNewTagInput('');
      setTagSuggestions([]);
    }
  };

  const cancelAttributes = () => {
    setEditingAttributes(null);
    setEditingKeyName('');
    setNewTagInput('');
    setTagSuggestions([]);
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !attributesForm.tags.includes(trimmedTag)) {
      setAttributesForm({
        ...attributesForm,
        tags: [...attributesForm.tags, trimmedTag]
      });
    }
  };

  const removeTag = (tagToRemove: string) => {
    setAttributesForm({
      ...attributesForm,
      tags: attributesForm.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleTagInputChange = (value: string) => {
    setNewTagInput(value);

    if (value.trim()) {
      const allTags = mindcacheInstance.getAllTags();
      const filtered = allTags.filter((tag: string) =>
        tag.toLowerCase().includes(value.toLowerCase()) &&
        !attributesForm.tags.includes(tag)
      );
      setTagSuggestions(filtered);
    } else {
      setTagSuggestions([]);
    }
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (newTagInput.trim()) {
        addTag(newTagInput);
        setNewTagInput('');
        setTagSuggestions([]);
      }
    } else if (e.key === 'Backspace' && newTagInput === '' && attributesForm.tags.length > 0) {
      const lastTag = attributesForm.tags[attributesForm.tags.length - 1];
      removeTag(lastTag);
    } else if (e.key === 'Escape') {
      setTagSuggestions([]);
    }
  };

  const addTagFromSuggestion = (tag: string) => {
    addTag(tag);
    setNewTagInput('');
    setTagSuggestions([]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 mb-2">
      <div className="flex-1 border border-gray-600 rounded p-4 overflow-y-auto min-h-0">
        {Object.keys(stmState).length === 0 ? (
          <div className="text-gray-500">No cloud data yet. Use &quot;Add Key&quot; above or chat to create memories.</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(stmState)
              .filter(([key]) => {
                if (!selectedTags || selectedTags.length === 0) return true;
                const keyTags = mindcacheInstance.getTags(key);
                return selectedTags.some(selectedTag => keyTags.includes(selectedTag));
              })
              .map(([key, value]: [string, unknown]) => {
                const isEmpty = !value || (typeof value === 'string' && (value as string).trim() === '');
                const attributes = mindcacheInstance.get_attributes(key);
                const isSystemKey = key.startsWith('$');
                const contentType = attributes?.type || 'text';

                let displayValue = '';
                let isPreviewable = false;

                if (isEmpty) {
                  displayValue = '_______';
                } else if (contentType === 'image') {
                  const dataUrl = mindcacheInstance.get_data_url(key);
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

                const indicators = [];
                const tags = mindcacheInstance.getTags(key);
                if (attributes) {
                  if (contentType !== 'text') indicators.push(contentType.toUpperCase().charAt(0));
                  if (attributes.readonly) indicators.push('R');
                  if (!attributes.visible) indicators.push('V');
                  if (attributes.template) indicators.push('T');
                  if (attributes.hardcoded || isSystemKey) indicators.push('H');
                }

                return (
                  <div key={key} className="relative">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-gray-400 font-mono text-sm">{key}:</div>
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
                                className="text-xs bg-cyan-900 bg-opacity-50 text-cyan-300 px-2 py-0.5 rounded font-mono border border-cyan-600"
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
                          className="text-cyan-600 hover:text-yellow-400 font-mono text-sm leading-none px-1"
                          title="Edit Properties"
                        >
                          ...
                        </button>
                        <button
                          onClick={() => deleteSTMKey(key)}
                          className="text-cyan-600 hover:text-red-400 font-mono text-sm leading-none"
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
                          onBlur={saveEdit}
                          className="w-full bg-black text-cyan-400 font-mono text-sm px-2 py-2 focus:outline-none resize-y border border-gray-600 rounded"
                          rows={Math.max(6, editingValue.split('\n').length + 1)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.ctrlKey) saveEdit();
                            else if (e.key === 'Escape') cancelEdit();
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
                          className={`break-words whitespace-pre-wrap cursor-pointer hover:bg-cyan-900 hover:bg-opacity-20 p-1 -m-1 font-mono text-sm ${isEmpty ? 'text-gray-500' : 'text-cyan-400'}`}
                          onClick={() => {
                            if (contentType === 'image' || contentType === 'file') {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = contentType === 'image' ? 'image/*' : '*/*';
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (file) handleFileUpload(key, file);
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

                        {contentType === 'image' && isPreviewable && (
                          <div className="mt-2 max-w-xs">
                            <img
                              src={mindcacheInstance.get_data_url(key)}
                              alt={`Preview of ${key}`}
                              className="max-w-full h-auto border border-gray-600 rounded"
                              style={{ maxHeight: '200px' }}
                            />
                          </div>
                        )}

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

      {/* Attributes Editor Popup */}
      {editingAttributes && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div
            className="bg-black border-2 border-cyan-400 rounded-lg p-6 w-96 max-w-full max-h-full overflow-auto"
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelAttributes();
              else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveAttributes();
            }}
            tabIndex={0}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-cyan-300 font-mono text-sm">Key Properties</h3>
              <button onClick={cancelAttributes} className="text-cyan-600 hover:text-red-400 font-mono text-sm leading-none">×</button>
            </div>

            <div className="space-y-2">
              {/* Key Name */}
              <div className="flex flex-col space-y-2">
                <label className="text-gray-400 font-mono text-sm">key name:</label>
                <input
                  type="text"
                  value={editingKeyName}
                  onChange={(e) => setEditingKeyName(e.target.value)}
                  className="bg-black text-cyan-400 font-mono text-sm border border-cyan-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  placeholder="Key name..."
                />
              </div>

              {/* Type Selection */}
              <div className="flex flex-col space-y-2">
                <label className="text-gray-400 font-mono text-sm">type:</label>
                <select
                  value={attributesForm.type}
                  onChange={(e) => setAttributesForm({
                    ...attributesForm,
                    type: e.target.value as KeyType,
                    contentType: (e.target.value === 'text' || e.target.value === 'json') ? '' : attributesForm.contentType
                  })}
                  className="bg-black text-cyan-400 font-mono text-sm border border-cyan-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                >
                  <option value="text">text</option>
                  <option value="json">json</option>
                  <option value="image">image</option>
                  <option value="file">file</option>
                </select>
              </div>

              {/* Upload Button */}
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
                            setAttributesForm({
                              ...attributesForm,
                              contentType: file.type,
                              type: file.type.startsWith('image/') ? 'image' : 'file'
                            });
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
                    className="border border-cyan-400 text-cyan-400 font-mono text-sm px-3 py-2 rounded hover:bg-cyan-900 hover:bg-opacity-20 transition-colors"
                  >
                    Upload {attributesForm.type === 'image' ? 'Image' : 'File'}
                  </button>
                </div>
              )}

              {/* Readonly */}
              <div className="flex items-center justify-between">
                <div className="text-gray-400 font-mono text-sm">
                  <span className="text-yellow-400">[R]</span> readonly:
                  <div className="text-xs text-gray-500 mt-1">If true, won&apos;t appear in AI tools</div>
                </div>
                {attributesForm.hardcoded ? (
                  <span className="text-gray-500 font-mono px-2 py-1">{attributesForm.readonly ? 'true' : 'false'}</span>
                ) : (
                  <button
                    onClick={() => setAttributesForm({ ...attributesForm, readonly: !attributesForm.readonly })}
                    className="text-cyan-400 font-mono text-sm hover:bg-cyan-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                  >
                    {attributesForm.readonly ? 'true' : 'false'}
                  </button>
                )}
              </div>

              {/* Visible */}
              <div className="flex items-center justify-between">
                <div className="text-gray-400 font-mono text-sm">
                  <span className="text-yellow-400">[V]</span> visible:
                  <div className="text-xs text-gray-500 mt-1">If false, hidden from injectSTM/getSTM</div>
                </div>
                <button
                  onClick={() => setAttributesForm({ ...attributesForm, visible: !attributesForm.visible })}
                  className="text-cyan-400 font-mono text-sm hover:bg-cyan-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                >
                  {attributesForm.visible ? 'true' : 'false'}
                </button>
              </div>

              {/* Template */}
              <div className="flex items-center justify-between">
                <div className="text-gray-400 font-mono text-sm">
                  <span className="text-yellow-400">[T]</span> template:
                  <div className="text-xs text-gray-500 mt-1">Process with injectSTM on get</div>
                </div>
                {attributesForm.hardcoded ? (
                  <span className="text-gray-500 font-mono px-2 py-1">{attributesForm.template ? 'true' : 'false'}</span>
                ) : (
                  <button
                    onClick={() => setAttributesForm({ ...attributesForm, template: !attributesForm.template })}
                    className="text-cyan-400 font-mono text-sm hover:bg-cyan-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                  >
                    {attributesForm.template ? 'true' : 'false'}
                  </button>
                )}
              </div>

              {/* Hardcoded */}
              <div className="flex items-center justify-between">
                <div className="text-gray-400 font-mono text-sm">
                  <span className="text-yellow-400">[H]</span> hardcoded:
                </div>
                <span className="text-gray-500 font-mono px-2 py-1">{attributesForm.hardcoded ? 'true' : 'false'}</span>
              </div>

              {/* Tags */}
              <div className="flex flex-col space-y-2">
                <div className="text-gray-400 font-mono text-sm">tags:</div>

                <div className="relative">
                  <div className="bg-black border border-cyan-400 rounded px-2 py-2 focus-within:ring-1 focus-within:ring-cyan-400">
                    <div className="flex flex-wrap gap-1 items-center">
                      {attributesForm.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 text-xs bg-cyan-900 bg-opacity-50 text-cyan-300 px-2 py-1 rounded font-mono border border-cyan-600 group hover:bg-cyan-800 hover:bg-opacity-50 transition-colors"
                        >
                          {tag}
                          <button
                            onClick={() => removeTag(tag)}
                            className="text-cyan-400 hover:text-red-400 ml-1 leading-none"
                            title="Remove tag"
                          >
                            ×
                          </button>
                        </span>
                      ))}

                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => handleTagInputChange(e.target.value)}
                        onKeyDown={handleTagInput}
                        className="bg-transparent text-cyan-400 font-mono text-sm focus:outline-none flex-1 min-w-0"
                        placeholder={attributesForm.tags.length === 0 ? "Add tags..." : ""}
                        style={{ minWidth: '80px' }}
                      />
                    </div>
                  </div>

                  {tagSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-black border border-cyan-400 rounded shadow-lg max-h-40 overflow-y-auto">
                      {tagSuggestions.map((tag, index) => (
                        <button
                          key={index}
                          onClick={() => addTagFromSuggestion(tag)}
                          className="w-full text-left px-3 py-2 text-sm font-mono text-cyan-400 hover:bg-cyan-900 hover:bg-opacity-30 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {attributesForm.tags.length > 0 && (
                  <div className="text-xs text-gray-500">
                    Use getTagged(&quot;{attributesForm.tags[0]}&quot;)
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={saveAttributes}
                className="flex-1 bg-cyan-400 text-black font-mono text-sm px-4 py-2 rounded hover:bg-cyan-300"
              >
                Save
              </button>
              <button
                onClick={cancelAttributes}
                className="flex-1 border border-cyan-400 text-cyan-400 font-mono text-sm px-4 py-2 rounded hover:bg-cyan-900 hover:bg-opacity-20"
              >
                Cancel
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-500 text-center">
              Ctrl+Enter to save &bull; Esc to cancel
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

