'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { updateProject, type Project } from '@/lib/api';

interface GitHubSyncSettingsProps {
    project: Project;
    onClose: () => void;
    onUpdated: (project: Project) => void;
}

export function GitHubSyncSettings({ project, onClose, onUpdated }: GitHubSyncSettingsProps) {
  const { getToken } = useAuth();
  const [repoInput, setRepoInput] = useState(project.github_repo || '');
  const [branch, setBranch] = useState(project.github_branch || 'main');
  const [path, setPath] = useState(project.github_path || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Parse repo input (e.g., "owner/repo")
      const repoValue = repoInput.trim() || null;
      if (repoValue && !repoValue.match(/^[\w-]+\/[\w.-]+$/)) {
        throw new Error('Invalid repository format. Use "owner/repo" format.');
      }

      const updated = await updateProject(token, project.id, {
        github_repo: repoValue,
        github_branch: branch.trim() || 'main',
        github_path: path.trim()
      });

      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const updated = await updateProject(token, project.id, {
        github_repo: null,
        github_branch: 'main',
        github_path: ''
      });

      setRepoInput('');
      setBranch('main');
      setPath('');
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <svg className="w-6 h-6 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
          <h3 className="text-lg font-semibold">GitHub Sync Settings</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
                            Repository
            </label>
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 outline-none transition"
              placeholder="owner/repository"
            />
            <p className="text-xs text-zinc-500 mt-1">
                            Enter the repository in "owner/repo" format
            </p>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
                            Branch
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 outline-none transition"
              placeholder="main"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
                            Path (optional)
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 outline-none transition"
              placeholder="mindcache-exports"
            />
            <p className="text-xs text-zinc-500 mt-1">
                            Folder in repo where exports will be saved
            </p>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-4">{error}</p>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800">
          {project.github_repo && (
            <button
              onClick={handleDisconnect}
              disabled={saving}
              className="text-sm text-red-400 hover:text-red-300 transition disabled:opacity-50"
            >
                            Disconnect
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-zinc-400 hover:text-white transition"
            >
                            Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
