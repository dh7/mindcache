'use client';

import { useState, useEffect } from 'react';
import { MindCache, ConnectionState } from 'mindcache';

interface CloudSTMMenuProps {
  connectionState: ConnectionState;
  onReconnect?: () => void;
  onRefresh?: () => void;
  selectedTags?: string[];
  onSelectedTagsChange?: (tags: string[]) => void;
  mindcacheInstance: MindCache;
}

export default function CloudSTMMenu({ 
  connectionState, 
  onReconnect, 
  onRefresh, 
  selectedTags = [], 
  onSelectedTagsChange,
  mindcacheInstance 
}: CloudSTMMenuProps) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    const updateTags = () => {
      setAvailableTags(mindcacheInstance.getAllTags());
    };
    
    updateTags();
    mindcacheInstance.subscribeToAll(updateTags);
    return () => mindcacheInstance.unsubscribeFromAll(updateTags);
  }, [mindcacheInstance]);

  const toggleTag = (tag: string) => {
    if (!onSelectedTagsChange) return;
    
    if (selectedTags.includes(tag)) {
      onSelectedTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onSelectedTagsChange([...selectedTags, tag]);
    }
  };

  const handleAddKey = () => {
    const key = prompt('Enter new STM key:');
    if (key && key.trim()) {
      if (!mindcacheInstance.has(key.trim())) {
        mindcacheInstance.set_value(key.trim(), '');
        console.log(`✅ Added new key: ${key.trim()}`);
      } else {
        alert(`Key "${key.trim()}" already exists`);
      }
    }
  };

  const clearSTM = () => {
    mindcacheInstance.clear();
    console.log('🗑️ STM cleared');
    if (onRefresh) {
      setTimeout(() => onRefresh(), 0);
    }
  };

  const exportSTM = () => {
    try {
      const markdown = mindcacheInstance.toMarkdown();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindcache-cloud-export-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ STM exported to markdown');
    } catch (error) {
      console.error('❌ Failed to export STM:', error);
      alert('Failed to export STM. Check console for details.');
    }
  };

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
              mindcacheInstance.fromMarkdown(markdown);
              console.log('✅ STM imported from markdown');
              if (onRefresh) {
                setTimeout(() => onRefresh(), 0);
              }
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
      alert('Failed to import STM. Check console for details.');
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'connected': return 'Cloud Synced';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection Error';
      default: return 'Disconnected';
    }
  };

  return (
    <div className="border border-gray-600 rounded p-4 font-mono text-sm flex-shrink-0 mb-2">
      {/* Connection Status */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`${getConnectionStatusColor()} text-lg`}>
            {getConnectionStatusIcon()}
          </span>
          <span className={getConnectionStatusColor()}>
            {getConnectionStatusText()}
          </span>
        </div>
        {connectionState === 'disconnected' || connectionState === 'error' ? (
          <button
            onClick={onReconnect}
            className="text-cyan-400 hover:text-cyan-300 transition-colors text-xs border border-cyan-400 px-2 py-1 rounded"
          >
            Reconnect
          </button>
        ) : connectionState === 'connecting' ? (
          <span className="text-yellow-400 animate-pulse text-xs">●●●</span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex space-x-4 mb-2">
        <div 
          className="text-cyan-400 cursor-pointer hover:text-cyan-300 transition-colors"
          onClick={handleAddKey}
          title="Add new STM key"
        >
          Add Key
        </div>
        <div 
          className="text-cyan-400 cursor-pointer hover:text-cyan-300 transition-colors"
          onClick={() => {
            if (confirm('Clear all cloud data? This will delete all entries.')) {
              clearSTM();
            }
          }}
          title="Clear STM - deletes all entries"
        >
          Clear
        </div>
        <div 
          className="text-cyan-400 cursor-pointer hover:text-cyan-300 transition-colors"
          onClick={exportSTM}
          title="Export STM to markdown file"
        >
          Export
        </div>
        <div 
          className="text-cyan-400 cursor-pointer hover:text-cyan-300 transition-colors"
          onClick={importSTM}
          title="Import STM from markdown file"
        >
          Import
        </div>
      </div>
      
      {/* Tag Filter Section */}
      {availableTags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="text-gray-400 text-xs mb-2">Filter by tags:</div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2 py-1 rounded font-mono border transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-cyan-900 bg-opacity-50 text-cyan-300 border-cyan-600'
                    : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-500'
                }`}
                title={selectedTags.includes(tag) ? 'Click to unselect' : 'Click to select'}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              Filtering by: {selectedTags.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

