'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GitStore, FileEntry } from '@mindcache/gitstore';

interface GitHubFileBrowserProps {
    gitStore: GitStore;
    onFileSelect?: (path: string, content: string) => void;
}

/**
 * GitHub file browser component
 * Displays repository contents with navigation
 */
export function GitHubFileBrowser({ gitStore, onFileSelect }: GitHubFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const entries = await gitStore.listFiles(path);
      // Sort: directories first, then files, alphabetically
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      setFiles(entries);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load files';
      setError(message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [gitStore]);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath, loadFiles]);

  // Convert full path to relative path (strip basePath prefix)
  const toRelativePath = (fullPath: string): string => {
    const basePath = gitStore.basePath;
    if (basePath && fullPath.startsWith(basePath)) {
      return fullPath.slice(basePath.length).replace(/^\//, '');
    }
    return fullPath;
  };

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.type === 'dir') {
      // Use relative path for navigation
      setCurrentPath(toRelativePath(entry.path));
      setPreviewFile(null);
    } else {
      // Load file content using relative path
      setLoadingFile(true);
      try {
        const content = await gitStore.readFile(toRelativePath(entry.path));
        setPreviewFile({ path: entry.path, content });
        onFileSelect?.(entry.path, content);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load file';
        setError(message);
      } finally {
        setLoadingFile(false);
      }
    }
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
    setPreviewFile(null);
  };

  const navigateTo = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    setCurrentPath(parts.slice(0, index + 1).join('/'));
    setPreviewFile(null);
  };

  // Build breadcrumb parts
  const breadcrumbs = currentPath.split('/').filter(Boolean);

  const getFileIcon = (entry: FileEntry) => {
    if (entry.type === 'dir') {
      return (
        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      );
    }
    // File icon based on extension
    const ext = entry.name.split('.').pop()?.toLowerCase();
    if (ext === 'md') {
      return (
        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header with breadcrumbs */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
        <svg className="w-4 h-4 text-zinc-500" fill="currentColor" viewBox="0 0 24 24">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
        </svg>
        <span className="text-zinc-400">{gitStore.owner}/{gitStore.repo}</span>
        <span className="text-zinc-600">/</span>

        {/* Breadcrumbs */}
        <button
          onClick={() => {
            setCurrentPath(''); setPreviewFile(null);
          }}
          className="text-zinc-400 hover:text-white transition"
        >
          {gitStore.basePath || 'root'}
        </button>

        {breadcrumbs.map((part, index) => (
          <span key={index} className="flex items-center gap-2">
            <span className="text-zinc-600">/</span>
            <button
              onClick={() => navigateTo(index)}
              className="text-zinc-400 hover:text-white transition"
            >
              {part}
            </button>
          </span>
        ))}

        {/* Refresh button */}
        <button
          onClick={() => loadFiles(currentPath)}
          className="ml-auto p-1 text-zinc-500 hover:text-white transition"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="divide-y divide-zinc-800/50">
        {loading ? (
          <div className="px-4 py-8 text-center text-zinc-500">Loading...</div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-red-400">{error}</div>
        ) : files.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-500">Empty directory</div>
        ) : (
          <>
            {/* Parent directory link */}
            {currentPath && (
              <button
                onClick={navigateUp}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-900/50 transition"
              >
                <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                <span className="text-zinc-400">..</span>
              </button>
            )}

            {/* File list */}
            {files.map((entry) => (
              <button
                key={entry.path}
                onClick={() => handleFileClick(entry)}
                className={[
                  'w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-zinc-900/50 transition',
                  previewFile?.path === entry.path ? 'bg-zinc-800/50' : ''
                ].join(' ')}
              >
                {getFileIcon(entry)}
                <span className="flex-1 truncate">{entry.name}</span>
                {entry.type === 'file' && entry.size !== undefined && (
                  <span className="text-xs text-zinc-500">
                    {entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}
                  </span>
                )}
                {entry.type === 'dir' && (
                  <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))}
          </>
        )}
      </div>

      {/* File preview */}
      {loadingFile && (
        <div className="px-4 py-4 border-t border-zinc-800 bg-zinc-900/30">
          <div className="text-zinc-500 text-sm">Loading file...</div>
        </div>
      )}
      {previewFile && !loadingFile && (
        <div className="border-t border-zinc-800">
          <div className="px-4 py-2 bg-zinc-900/30 border-b border-zinc-800/50 flex items-center justify-between">
            <span className="text-sm text-zinc-400 font-mono">{previewFile.path.split('/').pop()}</span>
            <span className="text-xs text-zinc-600">{previewFile.content.length} chars</span>
          </div>
          <pre className="px-4 py-3 text-sm text-zinc-300 overflow-auto max-h-64 bg-zinc-900/20">
            <code>{previewFile.content.slice(0, 2000)}{previewFile.content.length > 2000 ? '\n...' : ''}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
