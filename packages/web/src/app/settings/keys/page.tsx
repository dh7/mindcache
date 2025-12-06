'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { listApiKeys, createApiKey, deleteApiKey, listProjects, listInstances, type ApiKey } from '@/lib/api';

interface Project {
  id: string;
  name: string;
}

interface Instance {
  id: string;
  name: string;
}

export default function ApiKeysPage() {
  const { getToken } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [instances, setInstances] = useState<Record<string, Instance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      
      // Fetch keys and projects in parallel
      const [keysData, projectsData] = await Promise.all([
        listApiKeys(token),
        listProjects(token),
      ]);
      
      setKeys(keysData);
      
      // Build project lookup
      const projectMap: Record<string, Project> = {};
      for (const p of projectsData) {
        projectMap[p.id] = p;
      }
      setProjects(projectMap);

      // Fetch instances for all projects to get instance names
      const instanceMap: Record<string, Instance> = {};
      for (const p of projectsData) {
        try {
          const instancesData = await listInstances(token, p.id);
          for (const i of instancesData) {
            instanceMap[i.id] = { id: i.id, name: i.name };
          }
        } catch {
          // Ignore errors for individual projects
        }
      }
      setInstances(instanceMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const getScopeName = (key: ApiKey) => {
    if (key.scope_type === 'account') {
      return 'Full Account';
    }
    if (key.scope_type === 'project' && key.scope_id) {
      return projects[key.scope_id]?.name || key.scope_id.slice(0, 8) + '...';
    }
    if (key.scope_type === 'instance' && key.scope_id) {
      return instances[key.scope_id]?.name || key.scope_id.slice(0, 8) + '...';
    }
    return key.scope_type;
  };

  const getScopeBadgeColor = (scopeType: string) => {
    switch (scopeType) {
      case 'account': return 'bg-purple-900/30 text-purple-400';
      case 'project': return 'bg-blue-900/30 text-blue-400';
      case 'instance': return 'bg-green-900/30 text-green-400';
      default: return 'bg-gray-800 text-gray-400';
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Link href="/" className="text-gray-400 hover:text-white text-sm mb-6 inline-block">
        ← Back to Projects
      </Link>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-white text-black text-sm rounded hover:bg-gray-200"
        >
          + New Key
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Show newly created key */}
      {newlyCreatedKey && (
        <div className="mb-6 p-4 bg-green-900/20 border border-green-800 rounded-lg">
          <p className="text-green-400 font-medium mb-2">🔑 API Key Created</p>
          <p className="text-sm text-gray-400 mb-3">Copy this key now — you won't see it again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-black rounded text-green-400 font-mono text-sm break-all">
              {newlyCreatedKey}
            </code>
            <button
              onClick={() => copyToClipboard(newlyCreatedKey)}
              className="px-3 py-2 bg-green-800 rounded text-sm hover:bg-green-700 whitespace-nowrap"
            >
              {copiedKey ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewlyCreatedKey(null)}
            className="mt-3 text-gray-500 hover:text-gray-300 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          No API keys yet. Create one to use MindCache from your apps.
        </div>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-left text-sm text-gray-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map(key => (
                <tr key={key.id} className="border-b border-gray-800 last:border-b-0 hover:bg-gray-900/50">
                  <td className="px-4 py-3">
                    <span className="font-medium">{key.name}</span>
                    {key.last_used_at && (
                      <p className="text-gray-600 text-xs mt-0.5">
                        Used {new Date(key.last_used_at * 1000).toLocaleDateString()}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-gray-500">
                      {key.key_prefix}••••••••
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${getScopeBadgeColor(key.scope_type)}`}>
                      {key.scope_type}
                    </span>
                    {key.scope_id && (
                      <span className="ml-2 text-gray-400 text-sm">
                        {getScopeName(key)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-400 text-sm">
                      {Array.isArray(key.permissions) ? key.permissions.join(', ') : key.permissions}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="text-gray-600 hover:text-red-400 transition text-sm"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [instances, setInstances] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);

  useEffect(() => {
    if (scopeType === 'project' || scopeType === 'instance') {
      fetchProjects();
    }
  }, [scopeType]);

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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Create API Key</h3>
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

          {(scopeType === 'project' || scopeType === 'instance') && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Project</label>
              {loadingProjects ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <select
                  value={scopeType === 'project' ? scopeId : selectedProjectId}
                  onChange={(e) => {
                    if (scopeType === 'project') {
                      setScopeId(e.target.value);
                    } else {
                      setSelectedProjectId(e.target.value);
                      setScopeId('');
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
                >
                  <option value="">Select project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {scopeType === 'instance' && selectedProjectId && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Instance</label>
              {loadingInstances ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <select
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
                >
                  <option value="">Select instance...</option>
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
                <label key={perm} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm)}
                    onChange={() => togglePermission(perm)}
                    className="rounded bg-gray-800 border-gray-600"
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
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
