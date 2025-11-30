'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { listApiKeys, createApiKey, deleteApiKey, listProjects, listInstances, type ApiKey } from '@/lib/api';

export default function ApiKeysPage() {
  const { getToken } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      const data = await listApiKeys(token);
      setKeys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleDelete = async (keyId: string) => {
    if (!confirm('Delete this API key? This cannot be undone.')) return;
    try {
      const token = await getToken();
      if (!token) return;
      await deleteApiKey(token, keyId);
      setKeys(keys.filter(k => k.id !== keyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Link href="/" className="text-gray-400 hover:text-white text-sm mb-4 block">
        ← Back to Projects
      </Link>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">API Keys</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200"
        >
          Create API Key
        </button>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {/* Show newly created key */}
      {newlyCreatedKey && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-green-400 font-semibold mb-2">🔑 New API Key Created!</p>
          <p className="text-sm text-gray-300 mb-2">Copy this key now. You won't be able to see it again.</p>
          <code className="block p-3 bg-black rounded text-green-400 font-mono text-sm break-all">
            {newlyCreatedKey}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newlyCreatedKey);
              alert('Copied!');
            }}
            className="mt-2 px-3 py-1 bg-green-700 rounded text-sm hover:bg-green-600"
          >
            Copy to Clipboard
          </button>
          <button
            onClick={() => setNewlyCreatedKey(null)}
            className="mt-2 ml-2 px-3 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : keys.length === 0 ? (
        <div className="border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          <p>No API keys yet. Create one to use MindCache from your apps.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div key={key.id} className="border border-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{key.name}</h3>
                  <p className="text-gray-500 text-sm font-mono">{key.key_prefix}••••••••</p>
                  <p className="text-gray-500 text-xs mt-1">
                    Scope: {key.scope_type} 
                    {key.scope_id && ` (${key.scope_id.slice(0, 8)}...)`}
                  </p>
                  <p className="text-gray-500 text-xs">
                    Permissions: {Array.isArray(key.permissions) ? key.permissions.join(', ') : key.permissions}
                  </p>
                  {key.last_used_at && (
                    <p className="text-gray-500 text-xs">
                      Last used: {new Date(key.last_used_at * 1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(key.id)}
                  className="px-3 py-1 bg-red-900/50 rounded hover:bg-red-900 text-sm"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(key) => {
            setKeys([key, ...keys]);
            setNewlyCreatedKey(key.key!);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<'account' | 'project' | 'instance'>('account');
  const [scopeId, setScopeId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [permissions, setPermissions] = useState<string[]>(['read', 'write']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // For project/instance selection
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [instances, setInstances] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);

  // Fetch projects when scope type changes to project or instance
  useEffect(() => {
    if (scopeType === 'project' || scopeType === 'instance') {
      fetchProjects();
    }
  }, [scopeType]);

  // Fetch instances when project is selected (for instance scope)
  useEffect(() => {
    if (scopeType === 'instance' && selectedProjectId) {
      fetchInstances(selectedProjectId);
    }
  }, [scopeType, selectedProjectId]);

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);
      const token = await getToken();
      if (!token) return;
      const data = await listProjects(token);
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchInstances = async (projectId: string) => {
    try {
      setLoadingInstances(true);
      const token = await getToken();
      if (!token) return;
      const data = await listInstances(token, projectId);
      setInstances(data);
    } catch (err) {
      console.error('Failed to load instances:', err);
    } finally {
      setLoadingInstances(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (scopeType === 'project' && !scopeId) return;
    if (scopeType === 'instance' && !scopeId) return;

    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) return;

      const key = await createApiKey(token, {
        name: name.trim(),
        scopeType,
        scopeId: scopeType === 'account' ? undefined : scopeId,
        permissions,
      });
      onCreated(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePermission = (perm: string) => {
    if (permissions.includes(perm)) {
      setPermissions(permissions.filter(p => p !== perm));
    } else {
      setPermissions([...permissions, perm]);
    }
  };

  const handleScopeTypeChange = (newType: 'account' | 'project' | 'instance') => {
    setScopeType(newType);
    setScopeId('');
    setSelectedProjectId('');
    setInstances([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-4">Create API Key</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
              placeholder="My App"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Scope</label>
            <select
              value={scopeType}
              onChange={(e) => handleScopeTypeChange(e.target.value as 'account' | 'project' | 'instance')}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            >
              <option value="account">Full Account Access</option>
              <option value="project">Specific Project</option>
              <option value="instance">Specific Instance</option>
            </select>
          </div>

          {/* Project selector (for project or instance scope) */}
          {(scopeType === 'project' || scopeType === 'instance') && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">
                {scopeType === 'project' ? 'Select Project' : 'Select Project (then Instance)'}
              </label>
              {loadingProjects ? (
                <p className="text-gray-500 text-sm">Loading projects...</p>
              ) : (
                <select
                  value={scopeType === 'project' ? scopeId : selectedProjectId}
                  onChange={(e) => {
                    if (scopeType === 'project') {
                      setScopeId(e.target.value);
                    } else {
                      setSelectedProjectId(e.target.value);
                      setScopeId(''); // Reset instance selection
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
                >
                  <option value="">-- Select a project --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Instance selector (only for instance scope) */}
          {scopeType === 'instance' && selectedProjectId && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Select Instance</label>
              {loadingInstances ? (
                <p className="text-gray-500 text-sm">Loading instances...</p>
              ) : (
                <select
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
                >
                  <option value="">-- Select an instance --</option>
                  {instances.map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Permissions</label>
            <div className="flex gap-4">
              {['read', 'write', 'admin'].map(perm => (
                <label key={perm} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm)}
                    onChange={() => togglePermission(perm)}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">{perm}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !name.trim() || 
                submitting || 
                (scopeType === 'project' && !scopeId) ||
                (scopeType === 'instance' && !scopeId)
              }
              className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

