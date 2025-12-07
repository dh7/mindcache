'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description?: string;
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

  const fetchData = async () => {
    try {
      const token = await getToken() || 'dev';
      
      const projectRes = await fetch(`${API_URL}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!projectRes.ok) throw new Error('Project not found');
      const projectData = await projectRes.json();
      setProject(projectData);

      const instancesRes = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
        headers: { Authorization: `Bearer ${token}` },
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
    if (!newInstanceName.trim()) return;
    setCreating(true);
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newInstanceName }),
      });
      if (!res.ok) throw new Error('Failed to create instance');
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
    if (!deleteInstance) return;
    setDeleting(true);
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/projects/${projectId}/instances/${deleteInstance.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete instance');
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
      <div style={{ minHeight: '100vh', padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9ca3af' }}>Loading...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ minHeight: '100vh', padding: 32 }}>
        <div style={{ maxWidth: 1024, margin: '0 auto' }}>
          <div style={{ color: '#f87171', marginTop: 16, padding: 16, borderRadius: 8, border: '1px solid #7f1d1d' }}>
            {error || 'Project not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#0a0a0a', color: '#fff' }}>
      <div style={{ maxWidth: 1024, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>{project.name}</h1>
            {project.description && (
              <p style={{ color: '#6b7280', marginTop: 4 }}>{project.description}</p>
            )}
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ 
              padding: '8px 16px', 
              background: '#fff', 
              color: '#000', 
              fontSize: 14, 
              fontWeight: 500, 
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            + New Instance
          </button>
        </div>

        {/* Instances Table */}
        {instances.length === 0 ? (
          <div style={{ borderRadius: 12, padding: 48, textAlign: 'center', color: '#6b7280', border: '1px solid #374151' }}>
            No instances yet. Create one to get started.
          </div>
        ) : (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #374151' }}>
            {/* Table Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              padding: '12px 24px', 
              borderBottom: '1px solid #374151',
              background: '#111'
            }}>
              <div style={{ width: 180, fontSize: 12, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Name</div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Instance ID</div>
              <div style={{ width: 100, fontSize: 12, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Mode</div>
              <div style={{ width: 80 }}></div>
            </div>

            {/* Table Body */}
            {instances.map((instance, index) => (
              <div 
                key={instance.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '12px 24px',
                  borderBottom: index !== instances.length - 1 ? '1px solid #1f2937' : 'none',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#111'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {/* Name */}
                <div style={{ width: 180, fontWeight: 500 }}>{instance.name}</div>

                {/* Instance ID */}
                <div style={{ flex: 1 }}>
                  <button
                    onClick={() => copyToClipboard(instance.id)}
                    style={{ 
                      fontFamily: 'monospace', 
                      fontSize: 13, 
                      color: copiedId === instance.id ? '#4ade80' : '#9ca3af',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Click to copy"
                  >
                    {copiedId === instance.id ? '✓ Copied!' : `${instance.id.slice(0, 8)}...${instance.id.slice(-4)}`}
                  </button>
                </div>

                {/* Mode */}
                <div style={{ width: 100, color: '#9ca3af', fontSize: 14 }}>
                  {instance.is_readonly ? 'Read-only' : 'Editable'}
                </div>

                {/* Actions */}
                <div style={{ width: 80, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                  <Link
                    href={`/projects/${projectId}/instances/${instance.id}`}
                    style={{ color: '#6b7280', fontSize: 16, textDecoration: 'none' }}
                    title="Open"
                  >
                    ↗
                  </Link>
                  <button
                    onClick={() => setDeleteInstance(instance)}
                    style={{ 
                      color: '#6b7280', 
                      fontSize: 16, 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Delete"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Instance Modal */}
        {showCreateModal && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.8)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 50 
          }}>
            <div style={{ 
              background: '#1f2937', 
              padding: 24, 
              borderRadius: 12, 
              border: '1px solid #374151', 
              width: '100%', 
              maxWidth: 400 
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>New Instance</h3>
              <input
                type="text"
                placeholder="Instance name"
                style={{ 
                  width: '100%', 
                  padding: 12, 
                  background: '#111', 
                  border: '1px solid #374151', 
                  borderRadius: 8, 
                  marginBottom: 16,
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateInstance()}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ 
                    padding: '8px 16px', 
                    color: '#9ca3af', 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer' 
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInstance}
                  style={{ 
                    padding: '8px 16px', 
                    background: '#fff', 
                    color: '#000', 
                    borderRadius: 8, 
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: creating || !newInstanceName.trim() ? 0.5 : 1
                  }}
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
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.8)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 50 
          }}>
            <div style={{ 
              background: '#1f2937', 
              padding: 24, 
              borderRadius: 12, 
              border: '1px solid #374151', 
              width: '100%', 
              maxWidth: 400 
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Delete Instance</h3>
              <p style={{ color: '#9ca3af', marginBottom: 24 }}>
                Are you sure you want to delete <span style={{ color: '#fff', fontWeight: 500 }}>{deleteInstance.name}</span>? This cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={() => setDeleteInstance(null)}
                  style={{ 
                    padding: '8px 16px', 
                    color: '#9ca3af', 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer' 
                  }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteInstance}
                  style={{ 
                    padding: '8px 16px', 
                    background: '#dc2626', 
                    color: '#fff', 
                    borderRadius: 8, 
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: deleting ? 0.5 : 1
                  }}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
