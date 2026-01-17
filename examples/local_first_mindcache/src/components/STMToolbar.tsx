'use client';

import { useState, useRef } from 'react';
import { useMindCacheContext } from 'mindcache';

interface STMToolbarProps {
  onRefresh: () => void;
}

export default function STMToolbar({ onRefresh }: STMToolbarProps) {
  const { mindcache } = useMindCacheContext();
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddKey = () => {
    if (!mindcache || !newKeyName.trim()) return;
    
    mindcache.set_value(newKeyName.trim(), '', {
      systemTags: ['SystemPrompt', 'LLMWrite']
    });
    setNewKeyName('');
    setShowAddKey(false);
    onRefresh();
  };

  const handleExport = () => {
    if (!mindcache) return;
    
    const markdown = mindcache.toMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindcache-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mindcache) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      mindcache.fromMarkdown(content, { merge: true });
      onRefresh();
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClear = () => {
    if (!mindcache) return;
    if (confirm('Clear all MindCache data? This cannot be undone.')) {
      const keys = Object.keys(mindcache.getAll());
      keys.forEach(key => {
        if (!key.startsWith('$')) {
          mindcache.delete(key);
        }
      });
      onRefresh();
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#22c55e',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit'
  };

  return (
    <div style={{ 
      padding: '8px 16px', 
      borderBottom: '1px solid #333',
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
      {showAddKey ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddKey();
              if (e.key === 'Escape') setShowAddKey(false);
            }}
            placeholder="Key name..."
            autoFocus
            style={{
              padding: '6px 12px',
              background: '#111',
              border: '1px solid #22c55e',
              borderRadius: '4px',
              color: '#22c55e',
              fontSize: '12px',
              fontFamily: 'inherit',
              outline: 'none'
            }}
          />
          <button onClick={handleAddKey} style={buttonStyle}>Add</button>
          <button onClick={() => setShowAddKey(false)} style={buttonStyle}>Cancel</button>
        </div>
      ) : (
        <>
          <button onClick={() => setShowAddKey(true)} style={buttonStyle}>+ Add Key</button>
          <button onClick={handleExport} style={buttonStyle}>📤 Export</button>
          <button onClick={() => fileInputRef.current?.click()} style={buttonStyle}>📥 Import</button>
          <button onClick={handleClear} style={{ ...buttonStyle, borderColor: '#ef4444', color: '#ef4444' }}>🗑️ Clear</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </>
      )}
    </div>
  );
}
