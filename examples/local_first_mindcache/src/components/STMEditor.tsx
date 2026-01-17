'use client';

import { useState, useEffect } from 'react';
import { useMindCacheContext, type SystemTag } from 'mindcache';

interface STMEditorProps {
  onSTMChange?: () => void;
  stmVersion?: number;
}

export default function STMEditor({ onSTMChange, stmVersion }: STMEditorProps) {
  const { mindcache } = useMindCacheContext();
  const [stmState, setSTMState] = useState<Record<string, unknown>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingProps, setEditingProps] = useState<string | null>(null);
  const [propsForm, setPropsForm] = useState({
    keyName: '',
    systemTags: [] as SystemTag[]
  });

  // Sync state with mindcache
  useEffect(() => {
    if (!mindcache) return;
    setSTMState(mindcache.getAll());
  }, [mindcache, stmVersion]);

  // Subscribe to changes
  useEffect(() => {
    if (!mindcache) return;
    
    const updateState = () => {
      setSTMState(mindcache.getAll());
      onSTMChange?.();
    };
    
    mindcache.subscribeToAll(updateState);
    return () => mindcache.unsubscribeFromAll(updateState);
  }, [mindcache, onSTMChange]);

  const startEditing = (key: string, value: unknown) => {
    setEditingKey(key);
    setEditingValue(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || ''));
  };

  const saveEdit = () => {
    if (!mindcache || !editingKey) return;
    
    let parsedValue;
    try {
      parsedValue = JSON.parse(editingValue);
    } catch {
      parsedValue = editingValue;
    }
    
    mindcache.set_value(editingKey, parsedValue);
    setEditingKey(null);
    setEditingValue('');
  };

  const deleteKey = (key: string) => {
    if (!mindcache) return;
    mindcache.delete(key);
  };

  const startEditingProps = (key: string) => {
    if (!mindcache) return;
    
    const attrs = mindcache.get_attributes(key);
    setPropsForm({
      keyName: key,
      systemTags: attrs?.systemTags || []
    });
    setEditingProps(key);
  };

  const saveProps = () => {
    if (!mindcache || !editingProps) return;

    const oldKey = editingProps;
    const newKey = propsForm.keyName.trim();

    if (newKey !== oldKey) {
      if (mindcache.has(newKey) || newKey.startsWith('$')) {
        alert(`Key "${newKey}" already exists or is a system key`);
        return;
      }
      const value = mindcache.get_value(oldKey);
      mindcache.set_value(newKey, value, { systemTags: propsForm.systemTags });
      mindcache.delete(oldKey);
    } else {
      mindcache.set_attributes(oldKey, { systemTags: propsForm.systemTags });
    }

    setEditingProps(null);
  };

  const toggleSystemTag = (tag: SystemTag) => {
    const has = propsForm.systemTags.includes(tag);
    setPropsForm({
      ...propsForm,
      systemTags: has 
        ? propsForm.systemTags.filter(t => t !== tag)
        : [...propsForm.systemTags, tag]
    });
  };

  const entries = Object.entries(stmState).filter(([key]) => !key.startsWith('$'));

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      {entries.length === 0 ? (
        <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
          No data yet. Add a key or chat with the AI to create memories.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {entries.map(([key, value]) => {
            const attrs = mindcache?.get_attributes(key);
            const indicators = [];
            const sys = attrs?.systemTags || [];
            if (sys.includes('LLMWrite')) indicators.push('W');
            if (sys.includes('SystemPrompt')) indicators.push('S');

            return (
              <div key={key} style={{ 
                padding: '12px', 
                border: '1px solid #333', 
                borderRadius: '8px',
                background: '#0a0a0a'
              }}>
                {/* Header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#888', fontWeight: 500 }}>{key}</span>
                    {indicators.length > 0 && (
                      <span style={{ 
                        fontSize: '10px', 
                        color: '#eab308',
                        background: 'rgba(234, 179, 8, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        [{indicators.join('')}]
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => startEditingProps(key)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#666', 
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      title="Edit properties"
                    >
                      ⚙️
                    </button>
                    <button
                      onClick={() => deleteKey(key)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#666', 
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Value */}
                {editingKey === key ? (
                  <div>
                    <textarea
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) saveEdit();
                        if (e.key === 'Escape') setEditingKey(null);
                      }}
                      autoFocus
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        padding: '8px',
                        background: '#111',
                        border: '1px solid #22c55e',
                        borderRadius: '4px',
                        color: '#22c55e',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        resize: 'vertical',
                        outline: 'none'
                      }}
                    />
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#666', 
                      marginTop: '4px' 
                    }}>
                      Ctrl+Enter to save, Esc to cancel
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => startEditing(key, value)}
                    style={{
                      padding: '8px',
                      background: '#111',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: value ? '#22c55e' : '#666',
                      fontSize: '13px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {value ? String(value) : '(empty - click to edit)'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Properties Modal */}
      {editingProps && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            background: '#000',
            border: '2px solid #22c55e',
            borderRadius: '12px',
            padding: '24px',
            width: '400px',
            maxWidth: '90vw'
          }}>
            <h3 style={{ marginBottom: '16px', color: '#22c55e' }}>Key Properties</h3>
            
            {/* Key Name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#888', fontSize: '12px' }}>
                Key Name
              </label>
              <input
                type="text"
                value={propsForm.keyName}
                onChange={(e) => setPropsForm({ ...propsForm, keyName: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#111',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#22c55e',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
            </div>

            {/* System Tags */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '12px' }}>
                System Tags
              </label>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={propsForm.systemTags.includes('SystemPrompt')}
                    onChange={() => toggleSystemTag('SystemPrompt')}
                  />
                  <span>[S] SystemPrompt</span>
                  <span style={{ fontSize: '11px', color: '#666' }}>- Visible to AI</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={propsForm.systemTags.includes('LLMWrite')}
                    onChange={() => toggleSystemTag('LLMWrite')}
                  />
                  <span>[W] LLMWrite</span>
                  <span style={{ fontSize: '11px', color: '#666' }}>- AI can modify</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={saveProps}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#22c55e',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingProps(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#22c55e',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
