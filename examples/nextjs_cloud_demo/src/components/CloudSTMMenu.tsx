'use client';

import { useState, useEffect } from 'react';
import { MindCache, ConnectionState } from 'mindcache';

interface CloudSTMMenuProps {
  connectionState: ConnectionState;
  instanceId: string;
  onReconnect?: () => void;
  onRefresh?: () => void;
  selectedTags?: string[];
  onSelectedTagsChange?: (tags: string[]) => void;
  mindcacheInstance: MindCache;
}

export default function CloudSTMMenu({ 
  connectionState, 
  instanceId,
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
      } else {
        alert(`Key "${key.trim()}" already exists`);
      }
    }
  };

  const clearSTM = () => {
    mindcacheInstance.clear();
    if (onRefresh) setTimeout(() => onRefresh(), 0);
  };

  const exportSTM = () => {
    const markdown = mindcacheInstance.toMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindcache-${instanceId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importSTM = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            mindcacheInstance.fromMarkdown(event.target?.result as string);
            if (onRefresh) setTimeout(() => onRefresh(), 0);
          } catch (error) {
            alert('Failed to import markdown file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected': return 'Synced';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Offline';
    }
  };

  return (
    <div className="border border-gray-600 rounded p-4 font-mono text-sm flex-shrink-0 mb-2">
      {/* Connection Status */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`${getStatusColor()} text-lg`}>{getStatusIcon()}</span>
          <div>
            <span className={getStatusColor()}>{getStatusText()}</span>
            <div className="text-gray-500 text-xs">Instance: {instanceId.slice(0, 8)}...</div>
          </div>
        </div>
        {(connectionState === 'disconnected' || connectionState === 'error') && (
          <button
            onClick={onReconnect}
            className="text-cyan-400 hover:text-cyan-300 text-xs border border-cyan-400 px-2 py-1 rounded"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex space-x-4 mb-2">
        <button onClick={handleAddKey} className="text-cyan-400 hover:text-cyan-300">Add Key</button>
        <button onClick={() => confirm('Clear all data?') && clearSTM()} className="text-cyan-400 hover:text-cyan-300">Clear</button>
        <button onClick={exportSTM} className="text-cyan-400 hover:text-cyan-300">Export</button>
        <button onClick={importSTM} className="text-cyan-400 hover:text-cyan-300">Import</button>
      </div>
      
      {/* Tags */}
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
                    : 'text-gray-400 border-gray-600 hover:border-gray-500'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
