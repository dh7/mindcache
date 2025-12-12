'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  listDelegates,
  createDelegate,
  deleteDelegate,
  createDelegateSecret,
  listDelegateSecrets,
  revokeDelegateSecret,
  listDelegateGrants,
  grantDelegateAccess,
  revokeDelegateAccess,
  listProjects,
  listInstances,
  type Delegate,
  type DelegateGrant,
  type DelegateSecret
} from '@/lib/api';

interface Project {
  id: string;
  name: string;
}

interface Instance {
  id: string;
  name: string;
  project_id: string;
}

// Helper function for permission badge colors
function getPermissionBadgeColor(permission: string): string {
  switch (permission) {
    case 'system': return 'bg-purple-900/30 text-purple-400';
    case 'write': return 'bg-blue-900/30 text-blue-400';
    case 'read': return 'bg-green-900/30 text-green-400';
    default: return 'bg-gray-800 text-gray-400';
  }
}

export default function DelegatesPage() {
  const { getToken } = useAuth();
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [grants, setGrants] = useState<Record<string, DelegateGrant[]>>({});
  const [secrets, setSecrets] = useState<Record<string, DelegateSecret[]>>({});
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [instances, setInstances] = useState<Record<string, Instance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<{ delegateId: string; secretId: string; secret: string; name: string | null } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [expandedDelegate, setExpandedDelegate] = useState<string | null>(null);
  const [showCreateSecretModal, setShowCreateSecretModal] = useState<{ delegateId: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        return;
      }

      // Fetch delegates and projects in parallel
      const [delegatesData, projectsData] = await Promise.all([
        listDelegates(token),
        listProjects(token)
      ]);

      setDelegates(delegatesData);

      // Build project lookup
      const projectMap: Record<string, Project> = {};
      for (const p of projectsData) {
        projectMap[p.id] = p;
      }
      setProjects(projectMap);

      // Fetch instances for all projects
      const instanceMap: Record<string, Instance> = {};
      for (const p of projectsData) {
        try {
          const instancesData = await listInstances(token, p.id);
          for (const i of instancesData) {
            instanceMap[i.id] = i;
          }
        } catch {
          // Ignore errors for individual projects
        }
      }
      setInstances(instanceMap);

      // Fetch grants and secrets for all delegates
      const grantsMap: Record<string, DelegateGrant[]> = {};
      const secretsMap: Record<string, DelegateSecret[]> = {};
      for (const delegate of delegatesData) {
        try {
          const grantsData = await listDelegateGrants(token, delegate.delegate_id);
          grantsMap[delegate.delegate_id] = grantsData;
        } catch {
          grantsMap[delegate.delegate_id] = [];
        }
        try {
          const secretsData = await listDelegateSecrets(token, delegate.delegate_id);
          secretsMap[delegate.delegate_id] = secretsData;
        } catch {
          secretsMap[delegate.delegate_id] = [];
        }
      }
      setGrants(grantsMap);
      setSecrets(secretsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delegates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (delegateId: string) => {
    if (!confirm('Delete this delegate? This cannot be undone.')) {
      return;
    }
    try {
      const token = await getToken();
      if (!token) {
        return;
      }
      await deleteDelegate(token, delegateId);
      setDelegates(delegates.filter(d => d.delegate_id !== delegateId));
      delete grants[delegateId];
      setGrants({ ...grants });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleGrantAccess = async (delegateId: string, instanceId: string, permission: 'read' | 'write' | 'system') => {
    try {
      const token = await getToken();
      if (!token) {
        return;
      }
      await grantDelegateAccess(token, delegateId, instanceId, permission);
      // Refresh grants
      const grantsData = await listDelegateGrants(token, delegateId);
      setGrants({ ...grants, [delegateId]: grantsData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
    }
  };

  const handleRevokeAccess = async (delegateId: string, instanceId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        return;
      }
      await revokeDelegateAccess(token, delegateId, instanceId);
      // Refresh grants
      const grantsData = await listDelegateGrants(token, delegateId);
      setGrants({ ...grants, [delegateId]: grantsData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const getKeyPermissionBadge = (delegate: Delegate) => {
    const perms = [];
    if (delegate.can_read) {
      perms.push('read');
    }
    if (delegate.can_write) {
      perms.push('write');
    }
    if (delegate.can_system) {
      perms.push('system');
    }
    return perms.join(', ') || 'none';
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6 mt-2">
        <div>
          <h1 className="text-2xl font-bold">Delegates</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create API keys (delegates) with fine-grained permissions.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-white text-black text-sm rounded hover:bg-gray-200"
        >
          + New Delegate
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Show newly created secret */}
      {newlyCreatedSecret && (
        <div className="mb-6 p-4 bg-red-900/20 border-2 border-red-800 rounded-lg">
          <div className="flex items-start justify-between mb-3">
            <p className="text-red-400 font-bold text-lg">⚠️ COPY SECRET NOW - IT WON'T BE SHOWN AGAIN</p>
            <button
              onClick={() => setNewlyCreatedSecret(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-red-300 mb-4 font-medium">
            <strong>This secret will NEVER be displayed again.</strong> Copy it now. You can revoke it later if needed.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400">Delegate ID:</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-black rounded text-green-400 font-mono text-sm break-all">
                  {newlyCreatedSecret.delegateId}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedSecret.delegateId)}
                  className="px-3 py-2 bg-green-800 rounded text-sm hover:bg-green-700 whitespace-nowrap"
                >
                  {copiedSecret ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Secret:</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-black rounded text-green-400 font-mono text-sm break-all">
                  {newlyCreatedSecret.secret}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedSecret.secret)}
                  className="px-3 py-2 bg-green-800 rounded text-sm hover:bg-green-700 whitespace-nowrap"
                >
                  {copiedSecret ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Complete API Key (use in requests):</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-black rounded text-green-400 font-mono text-xs break-all">
                  Authorization: ApiKey {newlyCreatedSecret.delegateId}:{newlyCreatedSecret.secret}
                </code>
                <button
                  onClick={() => copyToClipboard(`ApiKey ${newlyCreatedSecret.delegateId}:${newlyCreatedSecret.secret}`)}
                  className="px-3 py-2 bg-green-800 rounded text-sm hover:bg-green-700 whitespace-nowrap"
                >
                  {copiedSecret ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading...</div>
      ) : delegates.length === 0 ? (
        <div className="border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          No delegates yet. Create one to use MindCache from your apps.
        </div>
      ) : (
        <div className="space-y-4">
          {delegates.map(delegate => (
            <div key={delegate.delegate_id} className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 hover:bg-gray-900/50">
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setExpandedDelegate(expandedDelegate === delegate.delegate_id ? null : delegate.delegate_id)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium">{delegate.name}</span>
                      <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">
                        {getKeyPermissionBadge(delegate)}
                      </span>
                      {delegate.expires_at && (
                        <span className="text-xs text-gray-500">
                          Expires {new Date(delegate.expires_at * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-gray-500 font-mono">
                      {delegate.delegate_id}
                    </code>
                    <div className="mt-2 text-sm text-gray-400">
                      {grants[delegate.delegate_id]?.length || 0} instance access grant{grants[delegate.delegate_id]?.length !== 1 ? 's' : ''} • {' '}
                      {secrets[delegate.delegate_id]?.filter(s => !s.revoked_at).length || 0} active secret{(secrets[delegate.delegate_id]?.filter(s => !s.revoked_at).length || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedDelegate(expandedDelegate === delegate.delegate_id ? null : delegate.delegate_id)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition"
                      title={expandedDelegate === delegate.delegate_id ? 'Collapse' : 'Expand'}
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${expandedDelegate === delegate.delegate_id ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(delegate.delegate_id)}
                      className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition"
                      title="Delete delegate"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                {expandedDelegate === delegate.delegate_id && (
                  <div className="mt-4 space-y-4 border-t border-gray-800 pt-4">
                    {/* Secrets Section */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium">Secrets</h4>
                        <button
                          onClick={() => setShowCreateSecretModal({ delegateId: delegate.delegate_id })}
                          className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded"
                          title="Create a new secret for this delegate"
                        >
                          + New Secret
                        </button>
                      </div>
                      {secrets[delegate.delegate_id]?.filter(s => !s.revoked_at).length === 0 ? (
                        <p className="text-sm text-gray-500">No active secrets. Create one to use this delegate.</p>
                      ) : (
                        <div className="space-y-2">
                          {secrets[delegate.delegate_id]?.filter(s => !s.revoked_at).map(secret => (
                            <div key={secret.secret_id} className="flex items-center justify-between p-2 bg-gray-900/50 rounded text-sm">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {secret.name ? (
                                    <span className="font-medium">{secret.name}</span>
                                  ) : (
                                    <span className="text-gray-400">Unnamed secret</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Created {new Date(secret.created_at * 1000).toLocaleString()}
                                  {secret.last_used_at && ` • Last used ${new Date(secret.last_used_at * 1000).toLocaleString()}`}
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!confirm('Revoke this secret? It will stop working immediately.')) {
                                    return;
                                  }
                                  try {
                                    const token = await getToken();
                                    if (!token) {
                                      return;
                                    }
                                    await revokeDelegateSecret(token, delegate.delegate_id, secret.secret_id);
                                    // Refresh secrets
                                    const updatedSecrets = await listDelegateSecrets(token, delegate.delegate_id);
                                    setSecrets({ ...secrets, [delegate.delegate_id]: updatedSecrets });
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : 'Failed to revoke secret');
                                  }
                                }}
                                className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded"
                              >
                                  Revoke
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Grants Section */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Instance Access Grants</h4>
                      <GrantManagement
                        delegate={delegate}
                        grants={grants[delegate.delegate_id] || []}
                        instances={instances}
                        projects={projects}
                        onGrant={handleGrantAccess}
                        onRevoke={handleRevokeAccess}
                        getToken={getToken}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateDelegateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(delegate) => {
            setDelegates([delegate, ...delegates]);
            setGrants({ ...grants, [delegate.delegate_id]: [] });
            setSecrets({ ...secrets, [delegate.delegate_id]: [] });
            setShowCreateModal(false);
          }}
        />
      )}

      {showCreateSecretModal && (
        <CreateSecretModal
          delegateId={showCreateSecretModal.delegateId}
          onClose={() => setShowCreateSecretModal(null)}
          onCreated={async (result) => {
            setNewlyCreatedSecret({
              delegateId: result.delegate_id,
              secretId: result.secret_id,
              secret: result.delegateSecret,
              name: result.name
            });
            // Refresh secrets for this delegate
            const token = await getToken();
            if (token) {
              const updatedSecrets = await listDelegateSecrets(token, result.delegate_id);
              setSecrets({ ...secrets, [result.delegate_id]: updatedSecrets });
            }
            setShowCreateSecretModal(null);
          }}
          getToken={getToken}
        />
      )}
    </div>
  );
}

function GrantManagement({
  delegate,
  grants,
  instances,
  projects,
  onGrant,
  onRevoke,
  getToken
}: {
  delegate: Delegate;
  grants: DelegateGrant[];
  instances: Record<string, Instance>;
  projects: Record<string, Project>;
  onGrant: (delegateId: string, instanceId: string, permission: 'read' | 'write' | 'system') => Promise<void>;
  onRevoke: (delegateId: string, instanceId: string) => Promise<void>;
  getToken: () => Promise<string | null>;
}) {
  const [showGrantModal, setShowGrantModal] = useState(false);

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium">Instance Access Grants</h4>
        <button
          onClick={() => setShowGrantModal(true)}
          className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded"
        >
          + Grant Access
        </button>
      </div>

      {grants.length === 0 ? (
        <p className="text-sm text-gray-500">No access grants yet. Grant access to specific instances.</p>
      ) : (
        <div className="space-y-2">
          {grants.map((grant, idx) => {
            const instanceId = grant.instance_id || grant.do_id;
            const instance = instanceId ? instances[instanceId] : null;
            const project = instance ? projects[instance.project_id] : null;

            return (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                <div>
                  <span className="text-sm font-medium">
                    {instance ? instance.name : instanceId ? instanceId.slice(0, 8) + '...' : 'Unknown'}
                  </span>
                  {project && (
                    <span className="text-xs text-gray-500 ml-2">({project.name})</span>
                  )}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${getPermissionBadgeColor(grant.permission)}`}>
                    {grant.permission}
                  </span>
                </div>
                {instanceId && (
                  <button
                    onClick={() => onRevoke(delegate.delegate_id, instanceId)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                        Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showGrantModal && (
        <GrantAccessModal
          delegate={delegate}
          instances={instances}
          projects={projects}
          onClose={() => setShowGrantModal(false)}
          onGrant={onGrant}
          getToken={getToken}
        />
      )}
    </div>
  );
}

function GrantAccessModal({
  delegate,
  instances,
  projects,
  onClose,
  onGrant,
  getToken
}: {
  delegate: Delegate;
  instances: Record<string, Instance>;
  projects: Record<string, Project>;
  onClose: () => void;
  onGrant: (delegateId: string, instanceId: string, permission: 'read' | 'write' | 'system') => Promise<void>;
  getToken: () => Promise<string | null>;
}) {
  // getToken parameter kept for API consistency but not currently used
  void getToken;
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  // Set initial permission based on delegate capabilities (prefer highest available)
  const getInitialPermission = (): 'read' | 'write' | 'system' => {
    if (delegate.can_system) {
      return 'system';
    }
    if (delegate.can_write) {
      return 'write';
    }
    if (delegate.can_read) {
      return 'read';
    }
    return 'read'; // fallback
  };
  const [permission, setPermission] = useState<'read' | 'write' | 'system'>(getInitialPermission());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstanceId) {
      return;
    }

    // Validate permission matches delegate capabilities
    if (permission === 'read' && !delegate.can_read) {
      setError('This delegate does not have read capability');
      return;
    }
    if (permission === 'write' && !delegate.can_write) {
      setError('This delegate does not have write capability');
      return;
    }
    if (permission === 'system' && !delegate.can_system) {
      setError('This delegate does not have system capability');
      return;
    }

    try {
      setSubmitting(true);
      await onGrant(delegate.delegate_id, selectedInstanceId, permission);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
    } finally {
      setSubmitting(false);
    }
  };

  const instanceList = Object.values(instances).sort((a, b) => {
    const projectA = projects[a.project_id]?.name || '';
    const projectB = projects[b.project_id]?.name || '';
    if (projectA !== projectB) {
      return projectA.localeCompare(projectB);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-2">Grant Access to Instance</h3>
        <p className="text-sm text-gray-400 mb-4">
          Allow this delegate to access a specific instance with the selected permission level.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Instance</label>
            <select
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            >
              <option value="">Select instance...</option>
              {instanceList.map(instance => {
                const project = projects[instance.project_id];
                return (
                  <option key={instance.id} value={instance.id}>
                    {project ? `${project.name} / ` : ''}{instance.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Permission Level</label>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'read' | 'write' | 'system')}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            >
              {delegate.can_read && (
                <option value="read">Read - Can view data</option>
              )}
              {delegate.can_write && (
                <option value="write">Write - Can modify data (includes read)</option>
              )}
              {delegate.can_system && (
                <option value="system">System - Full admin access (includes read & write)</option>
              )}
            </select>
            {!delegate.can_read && !delegate.can_write && !delegate.can_system && (
              <p className="text-red-400 text-xs mt-1">
                This delegate has no capabilities enabled. Enable at least one capability when creating the delegate.
              </p>
            )}
            <div className="mt-2 p-2 bg-gray-800/50 rounded text-xs">
              <p className="text-gray-400 mb-1">Delegate capabilities:</p>
              <p className="text-gray-300">
                {delegate.can_read ? '✓ Read' : '✗ Read'} • {delegate.can_write ? '✓ Write' : '✗ Write'} • {delegate.can_system ? '✓ System' : '✗ System'}
              </p>
              <p className="text-gray-500 mt-1">
                You can only grant permissions that match the delegate's capabilities.
                {!delegate.can_read && ' This delegate cannot read data.'}
                {!delegate.can_write && ' This delegate cannot write data.'}
                {!delegate.can_system && ' This delegate cannot perform admin operations.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedInstanceId || submitting || (!delegate.can_read && !delegate.can_write && !delegate.can_system)}
              className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? 'Granting...' : 'Grant Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateDelegateModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (delegate: Delegate) => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState('');
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [canSystem, setCanSystem] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) {
        return;
      }

      const delegate = await createDelegate(token, {
        name: name.trim(),
        keyPermissions: {
          can_read: canRead,
          can_write: canWrite,
          can_system: canSystem
        },
        expiresAt: expiresAt || undefined
      });
      onCreated(delegate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Create Delegate</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
              placeholder="Analytics Dashboard"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Key-Level Permissions</label>
            <p className="text-xs text-gray-500 mb-3">
              These define what the delegate CAN do. You'll grant access to specific instances separately.
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canRead}
                  onChange={(e) => setCanRead(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">Can read data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canWrite}
                  onChange={(e) => setCanWrite(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">Can write data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canSystem}
                  onChange={(e) => setCanSystem(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">Can perform admin operations</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Expiration (Optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            />
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
              disabled={!name.trim() || submitting || (!canRead && !canWrite && !canSystem)}
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

function CreateSecretModal({
  delegateId,
  onClose,
  onCreated,
  getToken
}: {
  delegateId: string;
  onClose: () => void;
  onCreated: (result: { secret_id: string; delegate_id: string; delegateSecret: string; name: string | null; warning: string }) => void;
  getToken: () => Promise<string | null>;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) {
        return;
      }

      const result = await createDelegateSecret(token, delegateId, name.trim() || undefined);
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create secret');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Create Secret</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Name (Optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
              placeholder="Production API, Dev Environment, etc."
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Give this secret a name to help you identify it later.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-white text-black rounded text-sm hover:bg-gray-200 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Secret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
