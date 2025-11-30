'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

  const fetchData = async () => {
    try {
      const token = await getToken() || 'dev';
      
      // Fetch project
      const projectRes = await fetch(`${API_URL}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!projectRes.ok) throw new Error('Project not found');
      const projectData = await projectRes.json();
      setProject(projectData);

      // Fetch instances
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

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-400 hover:underline mb-4 inline-block">
            ← Back to Projects
          </Link>
          <div className="text-red-500 mt-4">{error || 'Project not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-blue-400 hover:underline mb-4 inline-block">
            ← Back to Projects
          </Link>
          <h1 className="text-3xl font-bold mt-2">{project.name}</h1>
          {project.description && (
            <p className="text-gray-400 mt-2">{project.description}</p>
          )}
        </div>

        {/* Instances Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Instances</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              New Instance
            </button>
          </div>

          {instances.length === 0 ? (
            <div className="border border-gray-700 rounded-lg p-8 text-center text-gray-500">
              No instances yet. Create one to get started.
            </div>
          ) : (
            <div className="grid gap-4">
              {instances.map((instance) => (
                <Link
                  key={instance.id}
                  href={`/projects/${projectId}/instances/${instance.id}`}
                  className="block bg-gray-900 p-4 rounded-lg hover:bg-gray-800 transition border border-gray-700"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-lg">{instance.name}</h3>
                      <p className="text-gray-500 text-sm">
                        {instance.is_readonly ? '🔒 Read-only' : '✏️ Editable'}
                      </p>
                    </div>
                    <div className="text-gray-400">→</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Create Instance Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Create New Instance</h3>
              <input
                type="text"
                placeholder="Instance name"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg mb-4"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-500"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInstance}
                  className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
                  disabled={creating || !newInstanceName.trim()}
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

