'use client';

import { useState, useEffect } from 'react';

interface Repo {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
}

interface Branch {
    name: string;
}

interface TreeItem {
    name: string;
    path: string;
    type: 'file' | 'dir';
}

interface GitHubImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: (projectId: string) => void;
}

export function GitHubImportModal({
  isOpen,
  onClose,
  onImportComplete
}: GitHubImportModalProps) {
  const [step, setStep] = useState<'repo' | 'branch' | 'folder' | 'confirm'>('repo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [repos, setRepos] = useState<Repo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [treeItems, setTreeItems] = useState<TreeItem[]>([]);

  // Selections
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [currentPath, setCurrentPath] = useState('');
  const [projectName, setProjectName] = useState('');

  // For confirmation step
  const [instanceFolders, setInstanceFolders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('repo');
      setError(null);
      setSelectedRepo(null);
      setSelectedBranch('');
      setCurrentPath('');
      setProjectName('');
      fetchRepos();
    }
  }, [isOpen]);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/browse?action=repos');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch repos');
      }
      const data = await res.json();
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repos');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async (repo: Repo) => {
    setLoading(true);
    setError(null);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const res = await fetch(
        `/api/github/browse?action=branches&owner=${owner}&repo=${repoName}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch branches');
      }
      const data = await res.json();
      setBranches(data.branches);
      setSelectedBranch(repo.default_branch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch branches');
    } finally {
      setLoading(false);
    }
  };

  const fetchTree = async (path: string = '') => {
    if (!selectedRepo) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [owner, repoName] = selectedRepo.full_name.split('/');
      const res = await fetch(
        `/api/github/browse?action=tree&owner=${owner}&repo=${repoName}` +
                `&branch=${selectedBranch}&path=${encodeURIComponent(path)}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch tree');
      }
      const data = await res.json();
      setTreeItems(data.items);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tree');
    } finally {
      setLoading(false);
    }
  };

  const checkForInstances = async () => {
    if (!selectedRepo) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [owner, repoName] = selectedRepo.full_name.split('/');
      const res = await fetch(
        `/api/github/browse?action=tree&owner=${owner}&repo=${repoName}` +
                `&branch=${selectedBranch}&path=${encodeURIComponent(currentPath)}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to check for instances');
      }
      const data = await res.json();
      const folders = data.items
        .filter((item: TreeItem) => item.type === 'dir')
        .map((item: TreeItem) => item.name);
      setInstanceFolders(folders);
      setProjectName(repoName);
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    fetchBranches(repo);
    setStep('branch');
  };

  const handleSelectBranch = () => {
    fetchTree('');
    setStep('folder');
  };

  const handleNavigateToFolder = (folder: TreeItem) => {
    fetchTree(folder.path);
  };

  const handleNavigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchTree(parts.join('/'));
  };

  const handleConfirmFolder = () => {
    checkForInstances();
  };

  const handleImport = async () => {
    if (!selectedRepo) {
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const [owner, repoName] = selectedRepo.full_name.split('/');
      const res = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo: repoName,
          branch: selectedBranch,
          path: currentPath,
          projectName
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Import failed');
      }

      const data = await res.json();
      onImportComplete(data.project.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Import from GitHub</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
                        ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded p-3 mb-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {/* Step 1: Select Repo */}
          {step === 'repo' && (
            <div>
              <p className="text-zinc-400 text-sm mb-3">Select a repository:</p>
              {loading ? (
                <div className="text-zinc-500 text-center py-8">Loading...</div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-auto">
                  {repos.map(repo => (
                    <button
                      key={repo.id}
                      onClick={() => handleSelectRepo(repo)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-zinc-800 transition flex items-center gap-2"
                    >
                      <span className="flex-1">{repo.full_name}</span>
                      {repo.private && (
                        <span className="text-xs text-zinc-500">private</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Branch */}
          {step === 'branch' && (
            <div>
              <p className="text-zinc-400 text-sm mb-3">
                                Select branch for <strong>{selectedRepo?.full_name}</strong>:
              </p>
              {loading ? (
                <div className="text-zinc-500 text-center py-8">Loading...</div>
              ) : (
                <>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full bg-zinc-800 rounded px-3 py-2 mb-4"
                  >
                    {branches.map(branch => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('repo')}
                      className="px-4 py-2 bg-zinc-700 rounded hover:bg-zinc-600"
                    >
                                            Back
                    </button>
                    <button
                      onClick={handleSelectBranch}
                      className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200"
                    >
                                            Continue
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Browse Folders */}
          {step === 'folder' && (
            <div>
              <p className="text-zinc-400 text-sm mb-2">
                                Navigate to the folder containing your instances:
              </p>
              <p className="text-xs text-zinc-500 mb-3">
                                /{currentPath || '(root)'}
              </p>
              {loading ? (
                <div className="text-zinc-500 text-center py-8">Loading...</div>
              ) : (
                <>
                  <div className="space-y-1 max-h-48 overflow-auto mb-4 border border-zinc-700 rounded p-2">
                    {currentPath && (
                      <button
                        onClick={handleNavigateUp}
                        className="w-full text-left px-3 py-1.5 rounded hover:bg-zinc-800 text-zinc-400"
                      >
                                                ← ..
                      </button>
                    )}
                    {treeItems
                      .filter(item => item.type === 'dir')
                      .map(item => (
                        <button
                          key={item.path}
                          onClick={() => handleNavigateToFolder(item)}
                          className="w-full text-left px-3 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                                                    📁 {item.name}
                        </button>
                      ))}
                    {treeItems.filter(item => item.type === 'dir').length === 0 && (
                      <p className="text-zinc-500 text-sm px-3 py-2">No folders</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('branch')}
                      className="px-4 py-2 bg-zinc-700 rounded hover:bg-zinc-600"
                    >
                                            Back
                    </button>
                    <button
                      onClick={handleConfirmFolder}
                      className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200"
                    >
                                            Use This Folder
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && (
            <div>
              <p className="text-zinc-400 text-sm mb-4">
                                Found {instanceFolders.length} potential instance(s):
              </p>
              <div className="space-y-1 max-h-32 overflow-auto mb-4 border border-zinc-700 rounded p-2">
                {instanceFolders.map(name => (
                  <div key={name} className="px-3 py-1 text-sm">
                                        📦 {name}
                  </div>
                ))}
              </div>
              <div className="mb-4">
                <label className="block text-sm text-zinc-400 mb-1">
                                    Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-zinc-800 rounded px-3 py-2"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('folder')}
                  className="px-4 py-2 bg-zinc-700 rounded hover:bg-zinc-600"
                >
                                    Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || !projectName.trim()}
                  className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Import Project'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
