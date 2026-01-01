'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { GitHubSyncSettings } from '@/components/GitHubSyncSettings';
import { GitHubFileBrowser } from '@/components/GitHubFileBrowser';
import { useGitStore } from '@/hooks/useGitStore';

interface Project {
  id: string;
  name: string;
  description?: string;
  github_repo?: string;
  github_branch?: string;
  github_path?: string;
  created_at: number;
  updated_at: number;
}

interface Instance {
  id: string;
  name: string;
  is_readonly: number;
  created_at: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteInstance, setDeleteInstance] = useState<Instance | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showGitHubSettings, setShowGitHubSettings] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);

  // GitStore hook - creates a GitStore instance when project has GitHub configured
  const gitStore = useGitStore(project);

  const fetchData = async () => {
    try {
      const token = await getToken() || 'dev';

      const projectRes = await fetch(`${API_URL}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!projectRes.ok) {
        throw new Error('Project not found');
      }
      const projectData = await projectRes.json();
      setProject(projectData);

      const instancesRes = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (instancesRes.ok) {
        const data = await instancesRes.json();
        setInstances(data.instances || []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      return;
    }
    setCreating(true);
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newInstanceName })
      });
      if (!res.ok) {
        throw new Error('Failed to create instance');
      }
      setNewInstanceName('');
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteInstance = async () => {
    if (!deleteInstance) {
      return;
    }
    setDeleting(true);
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/instances/${deleteInstance.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Failed to delete instance');
      }
      setDeleteInstance(null);
      fetchData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-red-400 mt-4 p-4 rounded-lg border border-red-900">
            {error || 'Project not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 mt-2">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            {project.description && (
              <p className="text-zinc-500 mt-1">{project.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-zinc-500 text-sm font-mono">{project.id}</span>
              <button
                onClick={() => copyToClipboard(project.id)}
                className={`p-1 rounded transition ${copiedId === project.id ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Copy project ID"
              >
                {copiedId === project.id ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* GitHub Sync Settings Button */}
            <button
              onClick={() => setShowGitHubSettings(true)}
              className={[
                'flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition',
                project.github_repo
                  ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              ].join(' ')}
              title={
                project.github_repo
                  ? `Synced to ${project.github_repo}`
                  : 'Setup GitHub sync'
              }
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d={`M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217
                    .682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454
                    -1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531
                    1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636
                    -1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683
                    -.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0
                    0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747
                    -1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0
                    3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012
                    2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22
                    12c0-5.523-4.477-10-10-10z`.replace(/\s+/g, ' ')}
                />
              </svg>
              {project.github_repo ? (
                <span className="hidden sm:inline">{project.github_repo.split('/')[1]}</span>
              ) : (
                <span className="hidden sm:inline">GitHub</span>
              )}
              {project.github_repo && (
                <span className="w-2 h-2 bg-green-500 rounded-full" title="Connected" />
              )}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition"
            >
              + New Instance
            </button>
          </div>
        </div>

        {/* GitHub File Browser */}
        {project.github_repo && gitStore && (
          <div className="mb-6">
            <button
              onClick={() => setShowFileBrowser(!showFileBrowser)}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition mb-3"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showFileBrowser ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Browse {project.github_repo}
            </button>
            {showFileBrowser && <GitHubFileBrowser gitStore={gitStore} />}
          </div>
        )}

        {/* Instances Table */}
        {instances.length === 0 ? (
          <div className="rounded-xl p-12 text-center text-zinc-500 border border-zinc-800">
            No instances yet. Create one to get started.
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-zinc-800">
            {/* Table Header */}
            <div className="flex items-center px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
              <div className="w-44 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</div>
              <div className="flex-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Instance ID</div>
              <div className="w-24 text-xs font-medium text-zinc-500 uppercase tracking-wider">Mode</div>
              <div className="w-12"></div>
            </div>

            {/* Table Body */}
            {instances.map((instance, index) => (
              <div
                key={instance.id}
                onClick={() => router.push(`/projects/${projectId}/instances/${instance.id}`)}
                className={`flex items-center px-6 py-3 hover:bg-zinc-900/50 transition
                  cursor-pointer group ${index !== instances.length - 1 ? 'border-b border-zinc-800/50' : ''
              }`}
              >
                {/* Name */}
                <div className="w-44 font-medium group-hover:text-white transition">{instance.name}</div>

                {/* Instance ID */}
                <div className="flex-1 flex items-center gap-2">
                  <span className="font-mono text-sm text-zinc-500">
                    {instance.id.slice(0, 8)}...{instance.id.slice(-4)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(instance.id);
                    }}
                    className={`p-1 rounded transition ${copiedId === instance.id ? 'text-green-400' : 'text-zinc-600 hover:text-zinc-300'
                    }`}
                    title="Copy instance ID"
                  >
                    {copiedId === instance.id ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Mode */}
                <div className="w-24 text-zinc-500 text-sm">
                  {instance.is_readonly ? 'Read-only' : 'Editable'}
                </div>

                {/* Actions */}
                <div className="w-12 flex items-center justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteInstance(instance);
                    }}
                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Instance Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">New Instance</h3>
              <input
                type="text"
                placeholder="Instance name"
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg mb-4 text-white outline-none focus:border-zinc-500 transition"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateInstance()}
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white transition"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInstance}
                  className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition disabled:opacity-50"
                  disabled={creating || !newInstanceName.trim()}
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteInstance && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-2">Delete Instance</h3>
              <p className="text-zinc-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{deleteInstance.name}</span>? This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteInstance(null)}
                  className="px-4 py-2 text-zinc-400 hover:text-white transition"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteInstance}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GitHub Sync Settings Modal */}
        {showGitHubSettings && project && (
          <GitHubSyncSettings
            project={project}
            onClose={() => setShowGitHubSettings(false)}
            onUpdated={(updated) => setProject(updated)}
          />
        )}
      </div>
    </div>
  );
}
