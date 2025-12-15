'use client';

import { useState, useEffect, useRef } from 'react';
import { KeyEntry } from '../types';

interface KeyPropertiesPanelProps {
    keyName: string;
    entry: KeyEntry;
    availableTags: string[];
    isExpanded: boolean;
    onToggle: () => void;
    onSave: (newKeyName: string, attributes: KeyEntry['attributes']) => void;
    onFileUpload: (key: string, file: File) => void;
    onValueChange: (key: string, value: string) => void;
    onClearValue: (key: string) => void;
    currentValue: string;
    canEdit: boolean;
}

export function KeyPropertiesPanel({
  keyName,
  entry,
  availableTags,
  isExpanded,
  onSave,
  onFileUpload,
  onValueChange,
  onClearValue,
  currentValue,
  canEdit
}: KeyPropertiesPanelProps) {
  const [attributesForm, setAttributesForm] = useState({
    readonly: entry.attributes.readonly,
    visible: entry.attributes.visible,
    hardcoded: entry.attributes.hardcoded,
    template: entry.attributes.template,
    type: entry.attributes.type,
    contentType: entry.attributes.contentType || '',
    tags: entry.attributes.tags || [],
    systemTags: entry.attributes.systemTags || [],
    zIndex: entry.attributes.zIndex ?? 0
  });
  const [zIndexInput, setZIndexInput] = useState(String(entry.attributes.zIndex ?? 0));
  const [isEditingZIndex, setIsEditingZIndex] = useState(false);
  const zIndexInputRef = useRef<HTMLInputElement>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  // Reset form when entry changes
  useEffect(() => {
    setAttributesForm({
      readonly: entry.attributes.readonly,
      visible: entry.attributes.visible,
      hardcoded: entry.attributes.hardcoded,
      template: entry.attributes.template,
      type: entry.attributes.type,
      contentType: entry.attributes.contentType || '',
      tags: entry.attributes.tags || [],
      systemTags: entry.attributes.systemTags || [],
      zIndex: entry.attributes.zIndex ?? 0
    });
    setZIndexInput(String(entry.attributes.zIndex ?? 0));
    setNewTagInput('');
    setIsEditingZIndex(false);
  }, [keyName, entry]);

  // Focus z-index input when editing starts
  useEffect(() => {
    if (isEditingZIndex && zIndexInputRef.current) {
      zIndexInputRef.current.focus();
      zIndexInputRef.current.select();
    }
  }, [isEditingZIndex]);

  const handleChange = <T extends keyof typeof attributesForm>(
    field: T,
    value: (typeof attributesForm)[T]
  ) => {
    const newForm = { ...attributesForm, [field]: value };
    setAttributesForm(newForm);
    // Auto-save on change
    onSave(keyName, newForm);
  };

  const handleZIndexSave = () => {
    const value = parseInt(zIndexInput, 10);
    const finalValue = isNaN(value) ? 0 : value;
    setZIndexInput(String(finalValue));
    handleChange('zIndex', finalValue);
    setIsEditingZIndex(false);
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !attributesForm.tags.includes(trimmedTag)) {
      handleChange('tags', [...attributesForm.tags, trimmedTag]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleChange('tags', attributesForm.tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagInputChange = (value: string) => {
    setNewTagInput(value);
    if (value.trim()) {
      const filtered = availableTags.filter(tag =>
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

  const handleFileUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = attributesForm.type === 'image' ? 'image/*' : '*/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const newType = file.type.startsWith('image/') ? 'image' : 'file';
        handleChange('contentType', file.type);
        handleChange('type', newType);
        await onFileUpload(keyName, file);
      }
    };
    input.click();
  };

  if (!isExpanded) {
    return null;
  }

  const contentType = attributesForm.type;
  const isTextType = contentType === 'text' || contentType === 'json';
  const isImageType = contentType === 'image';
  const isFileType = contentType === 'file';

  return (
    <div className="mt-1 space-y-3 animate-in slide-in-from-top-2 duration-200">
      {/* 1. Tags selector - right below key name */}
      <div className="flex flex-col space-y-1">
        <span className="text-gray-400 text-xs">tags:</span>
        <div className="relative">
          <div className="bg-black border border-zinc-700 rounded px-2 py-1.5 focus-within:border-cyan-600 transition-colors">
            <div className="flex flex-wrap gap-1 items-center">
              {attributesForm.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 text-xs bg-cyan-900 bg-opacity-50 text-cyan-300 px-1.5 py-0.5 rounded font-mono border border-cyan-600"
                >
                  {tag}
                  {canEdit && (
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-cyan-400 hover:text-red-400 leading-none"
                      title="Remove tag"
                    >
                                            ×
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => handleTagInputChange(e.target.value)}
                  onKeyDown={handleTagInput}
                  className="bg-transparent text-cyan-400 font-mono text-xs focus:outline-none flex-1 min-w-0"
                  placeholder={attributesForm.tags.length === 0 ? 'Add tags...' : ''}
                  style={{ minWidth: '60px' }}
                />
              )}
            </div>
          </div>

          {tagSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-black border border-zinc-700 rounded shadow-lg max-h-32 overflow-y-auto">
              {tagSuggestions.map((tag, index) => (
                <button
                  key={index}
                  onClick={() => addTagFromSuggestion(tag)}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-cyan-400 hover:bg-cyan-900 hover:bg-opacity-30 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Value - based on type */}
      {/* Text/JSON value editor */}
      {isTextType && canEdit && (
        <div className="flex flex-col space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">value:</span>
            {currentValue && (
              <button
                onClick={() => onClearValue(keyName)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                                clear
              </button>
            )}
          </div>
          <textarea
            className="w-full p-2 bg-black border border-zinc-700 rounded font-mono text-xs text-zinc-300 focus:border-cyan-600 outline-none resize-y transition-colors"
            rows={contentType === 'json' ? 6 : 3}
            value={currentValue}
            onChange={(e) => onValueChange(keyName, e.target.value)}
            placeholder="Enter value..."
          />
        </div>
      )}

      {/* Text/JSON readonly display */}
      {isTextType && !canEdit && currentValue && (
        <div className="flex flex-col space-y-1">
          <span className="text-gray-400 text-xs">value:</span>
          <pre className="text-xs font-mono text-zinc-300 bg-black p-2 rounded overflow-x-auto">
            {currentValue}
          </pre>
        </div>
      )}

      {/* Image display */}
      {isImageType && (
        <div className="flex flex-col space-y-2">
          <span className="text-gray-400 text-xs">image:</span>

          {/* Show image preview if available */}
          {currentValue && (
            <img
              src={currentValue}
              alt={`Preview of ${keyName}`}
              className="max-w-full h-auto border border-zinc-700 rounded"
              style={{ maxHeight: '300px' }}
            />
          )}

          {/* Upload and clear buttons */}
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleFileUploadClick}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                                upload image
              </button>
              {currentValue && (
                <button
                  onClick={() => onClearValue(keyName)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                                    clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* File display */}
      {isFileType && (
        <div className="flex flex-col space-y-2">
          <span className="text-gray-400 text-xs">file:</span>

          {currentValue && (
            <div className="text-xs text-zinc-400">
              {entry.attributes.contentType || 'File uploaded'}
            </div>
          )}

          {/* Upload and clear buttons */}
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleFileUploadClick}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                                upload file
              </button>
              {currentValue && (
                <button
                  onClick={() => onClearValue(keyName)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                                    clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Type Selection */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">type:</span>
        <select
          value={attributesForm.type}
          onChange={(e) => {
            const newType = e.target.value as 'text' | 'image' | 'file' | 'json';
            // Update type and contentType together to avoid race condition
            const newForm = {
              ...attributesForm,
              type: newType,
              contentType: (newType === 'text' || newType === 'json') ? '' : attributesForm.contentType
            };
            setAttributesForm(newForm);
            onSave(keyName, newForm);
          }}
          disabled={!canEdit}
          className="bg-black text-cyan-400 font-mono text-xs border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:border-cyan-600 disabled:opacity-50 transition-colors"
        >
          <option value="text">text</option>
          <option value="json">json</option>
          <option value="image">image</option>
          <option value="file">file</option>
        </select>
      </div>

      {/* 4. System tags (SystemPrompt, LLMRead, LLMWrite, ApplyTemplate) and z-index - at the end */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* SystemPrompt */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[SP]</span>
          <button
            onClick={() => {
              const currentSystemTags = attributesForm.systemTags || [];
              const hasSystemPrompt = currentSystemTags.includes('SystemPrompt') || currentSystemTags.includes('prompt');
              const newSystemTags = hasSystemPrompt
                ? currentSystemTags.filter(t => t !== 'SystemPrompt' && t !== 'prompt')
                : [...currentSystemTags.filter(t => t !== 'SystemPrompt' && t !== 'prompt'), 'SystemPrompt'];
              // Update both at once to avoid async state issues
              const newForm = { ...attributesForm, systemTags: newSystemTags, visible: !hasSystemPrompt };
              setAttributesForm(newForm);
              onSave(keyName, newForm);
            }}
            disabled={!canEdit}
            className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
            title="SystemPrompt: Include in system prompt"
          >
            {(attributesForm.systemTags || []).includes('SystemPrompt') || (attributesForm.systemTags || []).includes('prompt') ? 'true' : 'false'}
          </button>
        </div>

        {/* LLMRead */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[LR]</span>
          <button
            onClick={() => {
              const currentSystemTags = attributesForm.systemTags || [];
              const hasLLMRead = currentSystemTags.includes('LLMRead');
              const newSystemTags = hasLLMRead
                ? currentSystemTags.filter(t => t !== 'LLMRead')
                : [...currentSystemTags.filter(t => t !== 'LLMRead'), 'LLMRead'];
              const newForm = { ...attributesForm, systemTags: newSystemTags };
              setAttributesForm(newForm);
              onSave(keyName, newForm);
            }}
            disabled={!canEdit}
            className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
            title="LLMRead: LLM can read this key"
          >
            {(attributesForm.systemTags || []).includes('LLMRead') ? 'true' : 'false'}
          </button>
        </div>

        {/* LLMWrite */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[LW]</span>
          {attributesForm.hardcoded ? (
            <span className="text-gray-500 font-mono">{(attributesForm.systemTags || []).includes('LLMWrite') ? 'true' : 'false'}</span>
          ) : (
            <button
              onClick={() => {
                const currentSystemTags = attributesForm.systemTags || [];
                const hasLW = currentSystemTags.includes('LLMWrite');
                const newSystemTags = hasLW
                  ? currentSystemTags.filter(t => t !== 'LLMWrite')
                  : [...currentSystemTags.filter(t => t !== 'LLMWrite' && t !== 'readonly'), 'LLMWrite'];
                const newForm = { ...attributesForm, systemTags: newSystemTags, readonly: hasLW };
                setAttributesForm(newForm);
                onSave(keyName, newForm);
              }}
              disabled={!canEdit}
              className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
              title="LLMWrite: LLM can write via tools"
            >
              {(attributesForm.systemTags || []).includes('LLMWrite') ? 'true' : 'false'}
            </button>
          )}
        </div>

        {/* ApplyTemplate */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[AT]</span>
          {attributesForm.hardcoded ? (
            <span className="text-gray-500 font-mono">{(attributesForm.systemTags || []).includes('ApplyTemplate') ? 'true' : 'false'}</span>
          ) : (
            <button
              onClick={() => {
                const currentSystemTags = attributesForm.systemTags || [];
                const hasAT = currentSystemTags.includes('ApplyTemplate') || currentSystemTags.includes('template');
                const newSystemTags = hasAT
                  ? currentSystemTags.filter(t => t !== 'ApplyTemplate' && t !== 'template')
                  : [...currentSystemTags.filter(t => t !== 'ApplyTemplate' && t !== 'template'), 'ApplyTemplate'];
                const newForm = { ...attributesForm, systemTags: newSystemTags, template: !hasAT };
                setAttributesForm(newForm);
                onSave(keyName, newForm);
              }}
              disabled={!canEdit}
              className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
              title="ApplyTemplate: Process template injection"
            >
              {(attributesForm.systemTags || []).includes('ApplyTemplate') || (attributesForm.systemTags || []).includes('template') ? 'true' : 'false'}
            </button>
          )}
        </div>

        {/* Protected - just display if true */}
        {attributesForm.hardcoded && (
          <div className="flex items-center gap-1">
            <span className="text-yellow-400">[P]</span>
            <span className="text-gray-500 font-mono">true</span>
          </div>
        )}

        {/* Z-Index - same pattern as key name: value + pen, click to edit with underline */}
        <div className="flex items-center gap-1">
          <span className="text-gray-400">z:</span>
          {isEditingZIndex ? (
            <input
              ref={zIndexInputRef}
              type="text"
              value={zIndexInput}
              onChange={(e) => setZIndexInput(e.target.value)}
              onBlur={handleZIndexSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleZIndexSave();
                }
                if (e.key === 'Escape') {
                  setZIndexInput(String(attributesForm.zIndex));
                  setIsEditingZIndex(false);
                }
              }}
              className="font-mono text-cyan-400 bg-transparent border-0 border-b border-zinc-500 focus:border-cyan-400 focus:outline-none focus:ring-0 w-8 pb-0.5"
            />
          ) : canEdit ? (
            <div
              className="flex items-center gap-1 cursor-pointer group"
              onClick={() => setIsEditingZIndex(true)}
            >
              <span className="font-mono text-cyan-400">{attributesForm.zIndex}</span>
              <svg
                className="w-3 h-3 text-zinc-500 group-hover:text-cyan-400 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          ) : (
            <span className="font-mono text-gray-500">{attributesForm.zIndex}</span>
          )}
        </div>
      </div>
    </div>
  );
}
