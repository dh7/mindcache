'use client';

import { useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';

interface STMMenuProps {
  onAddKey?: () => void;
  onRefresh?: () => void; // Called after load/import/clear to refresh all UI
}

export default function STMMenu({ onAddKey, onRefresh }: STMMenuProps) {
  const mindcacheRef = useRef(mindcache);

  // Global keyboard shortcuts
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
            if (confirm('Clear STM? This will delete all entries and reset the chat.')) {
              clearSTM();
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    if (onAddKey) {
      onAddKey();
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
        // Update mindcache first
        mindcacheRef.current.fromJSON(saved);
        console.log('✅ STM loaded from localStorage');
        
        // Then refresh all UI components
        if (onRefresh) {
          onRefresh();
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
      mindcacheRef.current.clear();
      console.log('🗑️ STM cleared');
      
      // Refresh all UI components (including chat reset)
      if (onRefresh) {
        onRefresh();
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
              
              // Update mindcache first
              mindcacheRef.current.fromMarkdown(markdown);
              console.log('✅ STM imported from markdown');
              
              // Then refresh all UI components
              if (onRefresh) {
                onRefresh();
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
    <div className="border border-green-400 rounded-t p-4 border-b-0 font-mono text-sm flex-shrink-0">
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
            if (confirm('Clear STM? This will delete all entries and reset the chat.')) {
              clearSTM();
            }
          }}
          title="Clear STM - deletes all entries (Ctrl+K)"
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
  );
}

