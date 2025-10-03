'use client';

import { useRef, useState, useEffect } from 'react';
import { mindcache } from 'mindcache';

interface STMMenuProps {
  onRefresh?: () => void; // Called after load/import/clear to refresh all UI
  selectedTags?: string[];
  onSelectedTagsChange?: (tags: string[]) => void;
}

export default function STMMenu({ onRefresh, selectedTags = [], onSelectedTagsChange }: STMMenuProps) {
  const mindcacheRef = useRef(mindcache);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Update available tags when STM changes
  useEffect(() => {
    const updateTags = () => {
      setAvailableTags(mindcacheRef.current.getAllTags());
    };
    
    // Initial load
    updateTags();
    
    // Subscribe to STM changes
    mindcacheRef.current.subscribeToAll(updateTags);
    return () => mindcacheRef.current.unsubscribeFromAll(updateTags);
  }, []);

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    if (!onSelectedTagsChange) {
      return;
    }
    
    if (selectedTags.includes(tag)) {
      onSelectedTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onSelectedTagsChange([...selectedTags, tag]);
    }
  };

  // Add a new STM key
  const handleAddKey = () => {
    const key = prompt('Enter new STM key:');
    if (key && key.trim()) {
      if (!mindcacheRef.current.has(key.trim())) {
        mindcacheRef.current.set_value(key.trim(), '');
        console.log(`✅ Added new key: ${key.trim()}`);
      } else {
        alert(`Key "${key.trim()}" already exists`);
      }
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
      alert('Failed to save STM. Check console for details.');
    }
  };

  // Load STM from localStorage
  const loadSTM = () => {
    try {
      const saved = localStorage.getItem('mindcache_stm');
      if (saved) {
        // Update mindcache first - this ensures STM is fully loaded
        mindcacheRef.current.fromJSON(saved);
        console.log('✅ STM loaded from localStorage');
        
        // Then refresh all UI components after STM is ready
        if (onRefresh) {
          // Use setTimeout to ensure mindcache updates propagate
          setTimeout(() => onRefresh(), 0);
        }
      } else {
        console.log('ℹ️ No saved STM found');
        alert('No saved STM found in localStorage.');
      }
    } catch (error) {
      console.error('❌ Failed to load STM:', error);
      alert('Failed to load STM. Check console for details.');
    }
  };

  // Clear STM
  const clearSTM = () => {
    try {
      // Clear mindcache first - this ensures STM is fully cleared
      mindcacheRef.current.clear();
      console.log('🗑️ STM cleared');
      
      // Refresh all UI components (including chat reset) after clear is complete
      if (onRefresh) {
        // Use setTimeout to ensure mindcache updates propagate
        setTimeout(() => onRefresh(), 0);
      }
    } catch (error) {
      console.error('❌ Failed to clear STM:', error);
      alert('Failed to clear STM. Check console for details.');
    }
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
      alert('Failed to export STM. Check console for details.');
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
              
              // Update mindcache first - this ensures STM is fully imported
              mindcacheRef.current.fromMarkdown(markdown);
              console.log('✅ STM imported from markdown');
              
              // Then refresh all UI components after import is complete
              if (onRefresh) {
                // Use setTimeout to ensure mindcache updates propagate
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

  return (
    <div className="border border-gray-600 rounded p-4 font-mono text-sm flex-shrink-0 mb-2">
      <div className="flex space-x-4 mb-2">
        <div 
          className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
          onClick={handleAddKey}
          title="Add new STM key"
        >
          Add Key
        </div>
        <div 
          className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
          onClick={loadSTM}
          title="Load STM from localStorage"
        >
          Load
        </div>
        <div 
          className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
          onClick={saveSTM}
          title="Save STM to localStorage"
        >
          Save
        </div>
        <div 
          className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
          onClick={() => {
            if (confirm('Clear STM? This will delete all entries and reset the chat.')) {
              clearSTM();
            }
          }}
          title="Clear STM - deletes all entries"
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
                    ? 'bg-blue-900 bg-opacity-50 text-blue-300 border-blue-600'
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

