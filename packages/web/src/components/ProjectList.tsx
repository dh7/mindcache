'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { listProjects, createProject, deleteProject, type Project } from '@/lib/api';
import { ShareModal } from './ShareModal';
import { GitHubImportModal } from './GitHubImportModal';

export function ProjectList() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sharingProject, setSharingProject] = useState<Project | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }
      const data = await listProjects(token);
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (projectId: string) => {
    if (!confirm('Delete this project?')) {
      return;
    }
    try {
      const token = await getToken();
      if (!token) {
        return;
      }
      await deleteProject(token, projectId);
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (loading) {
    return <div className="text-zinc-400 p-8 text-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchProjects}
          className="px-4 py-2 bg-zinc-800 rounded hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Your Projects</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.49.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
            </svg>
            Import
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition"
          >
            Create Project
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500">
          <p>No projects yet. Create your first project to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 hover:bg-zinc-900/50 transition cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg group-hover:text-white transition">{project.name}</h3>
                  {project.description && (
                    <p className="text-zinc-400 text-sm mt-1">{project.description}</p>
                  )}
                  <p className="text-zinc-500 text-xs mt-2">
                    Project ID: <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded select-all">{project.id}</span>
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Created {new Date(project.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSharingProject(project);
                    }}
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md transition"
                    title="Share"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(project) => {
            setProjects([project, ...projects]);
            setShowCreateModal(false);
          }}
        />
      )}

      {sharingProject && (
        <ShareModal
          resourceType="projects"
          resourceId={sharingProject.id}
          resourceName={sharingProject.name}
          onClose={() => setSharingProject(null)}
        />
      )}

      <GitHubImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(projectId) => {
          setShowImportModal(false);
          router.push(`/projects/${projectId}`);
        }}
      />
    </div>
  );
}

function CreateProjectModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }
      const project = await createProject(token, name.trim(), description.trim() || undefined);
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-4">Create Project</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:border-zinc-500 outline-none"
              placeholder="My Project"
              autoFocus
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-zinc-400 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:border-zinc-500 outline-none resize-none"
              rows={3}
              placeholder="What's this project for?"
            />
          </div>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="px-4 py-2 bg-white text-black rounded hover:bg-zinc-200 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

