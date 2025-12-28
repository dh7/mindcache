'use client';

import { useState, useEffect, useRef } from 'react';
import { STMEntry as KeyEntry, SystemTag } from 'mindcache';

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
    type: entry.attributes.type,
    contentType: entry.attributes.contentType || '',
    contentTags: entry.attributes.contentTags || [],
    systemTags: (entry.attributes.systemTags || []) as SystemTag[],
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
      type: entry.attributes.type,
      contentType: entry.attributes.contentType || '',
      contentTags: entry.attributes.contentTags || [],
      systemTags: (entry.attributes.systemTags || []) as SystemTag[],
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
    onSave(keyName, newForm as KeyEntry['attributes']);
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
    if (trimmedTag && !attributesForm.contentTags.includes(trimmedTag)) {
      handleChange('contentTags', [...attributesForm.contentTags, trimmedTag]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleChange('contentTags', attributesForm.contentTags.filter(tag => tag !== tagToRemove));
  };

  const handleTagInputChange = (value: string) => {
    setNewTagInput(value);
    if (value.trim()) {
      const filtered = availableTags.filter(tag =>
        tag.toLowerCase().includes(value.toLowerCase()) &&
        !attributesForm.contentTags.includes(tag)
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
    } else if (e.key === 'Backspace' && newTagInput === '' && attributesForm.contentTags.length > 0) {
      const lastTag = attributesForm.contentTags[attributesForm.contentTags.length - 1];
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

  const toggleSystemTag = (tag: SystemTag) => {
    const currentSystemTags = attributesForm.systemTags;
    const hasTag = currentSystemTags.includes(tag);
    const newSystemTags = hasTag
      ? currentSystemTags.filter(t => t !== tag)
      : [...currentSystemTags, tag];
    const newForm = { ...attributesForm, systemTags: newSystemTags };
    setAttributesForm(newForm);
    onSave(keyName, newForm as KeyEntry['attributes']);
  };

  if (!isExpanded) {
    return null;
  }

  const contentType = attributesForm.type;
  const isTextType = contentType === 'text' || contentType === 'json' || contentType === 'document';
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
              {attributesForm.contentTags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 bg-zinc-800 text-cyan-400 px-2 py-0.5 rounded text-xs"
                >
                  {tag}
                  {canEdit && (
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
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
                  placeholder={attributesForm.contentTags.length === 0 ? 'add tags...' : ''}
                  className="flex-1 min-w-[80px] bg-transparent text-white text-xs focus:outline-none placeholder-zinc-500"
                />
              )}
            </div>
          </div>
          {/* Tag suggestions dropdown */}
          {tagSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-40 overflow-auto">
              {tagSuggestions.map((tag, index) => (
                <button
                  key={index}
                  onClick={() => addTagFromSuggestion(tag)}
                  className="w-full text-left px-3 py-1.5 text-xs text-cyan-400 hover:bg-zinc-700 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Value Editor - different for text/json/image/file */}
      {isTextType && (
        <div className="flex flex-col space-y-1">
          <span className="text-gray-400 text-xs">value:</span>
          <textarea
            value={currentValue}
            onChange={(e) => onValueChange(keyName, e.target.value)}
            disabled={!canEdit}
            placeholder="enter value..."
            className="bg-black text-white font-mono text-sm border border-zinc-700 rounded px-3 py-2 focus:outline-none focus:border-cyan-600 disabled:opacity-50 transition-colors min-h-[80px] resize-y"
          />
        </div>
      )}

      {isImageType && (
        <div className="flex flex-col space-y-2">
          <span className="text-gray-400 text-xs">image:</span>

          {/* Image preview */}
          {currentValue && (
            <div className="relative max-w-[200px]">
              <img
                src={`data:${entry.attributes.contentType || 'image/png'};base64,${currentValue}`}
                alt={keyName}
                className="rounded border border-zinc-700 max-h-32 object-contain"
              />
            </div>
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
            const newType = e.target.value as 'text' | 'image' | 'file' | 'json' | 'document';
            // Update type and contentType together to avoid race condition
            const newForm = {
              ...attributesForm,
              type: newType,
              contentType: (newType === 'text' || newType === 'json' || newType === 'document') ? '' : attributesForm.contentType
            };
            setAttributesForm(newForm);
            onSave(keyName, newForm as KeyEntry['attributes']);
          }}
          disabled={!canEdit}
          className="bg-black text-cyan-400 font-mono text-xs border border-zinc-700 rounded px-2 py-1 focus:outline-none focus:border-cyan-600 disabled:opacity-50 transition-colors"
        >
          <option value="text">text</option>
          <option value="json">json</option>
          <option value="document">document</option>
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
            onClick={() => toggleSystemTag('SystemPrompt')}
            disabled={!canEdit}
            className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
            title="SystemPrompt: Include in system prompt"
          >
            {attributesForm.systemTags.includes('SystemPrompt') ? 'true' : 'false'}
          </button>
        </div>

        {/* LLMRead */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[LR]</span>
          <button
            onClick={() => toggleSystemTag('LLMRead')}
            disabled={!canEdit}
            className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
            title="LLMRead: LLM can read this key"
          >
            {attributesForm.systemTags.includes('LLMRead') ? 'true' : 'false'}
          </button>
        </div>

        {/* LLMWrite */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[LW]</span>
          <button
            onClick={() => toggleSystemTag('LLMWrite')}
            disabled={!canEdit}
            className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
            title="LLMWrite: LLM can write via tools"
          >
            {attributesForm.systemTags.includes('LLMWrite') ? 'true' : 'false'}
          </button>
        </div>

        {/* ApplyTemplate */}
        <div className="flex items-center gap-1">
          <span className="text-yellow-400">[AT]</span>
          <button
            onClick={() => toggleSystemTag('ApplyTemplate')}
            disabled={!canEdit}
            className="text-cyan-400 font-mono hover:bg-cyan-900 hover:bg-opacity-20 px-1 rounded transition-colors disabled:opacity-50"
            title="ApplyTemplate: Process template injection"
          >
            {attributesForm.systemTags.includes('ApplyTemplate') ? 'true' : 'false'}
          </button>
        </div>

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
