'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Instance, API_URL } from '../types';

interface Project {
    id: string;
    name: string;
    description?: string;
    github_repo?: string;
    github_branch?: string;
    github_path?: string;
}

interface UseInstanceOptions {
    projectId: string;
    instanceId: string;
}

interface UseInstanceReturn {
    instance: Instance | null;
    project: Project | null;
    instanceName: string;
    editingName: boolean;
    setEditingName: (editing: boolean) => void;
    setInstanceName: (name: string) => void;
    handleUpdateInstanceName: () => Promise<void>;
}

export function useInstance({ projectId, instanceId }: UseInstanceOptions): UseInstanceReturn {
  const { getToken } = useAuth();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [instanceName, setInstanceName] = useState('');
  const [editingName, setEditingName] = useState(false);

  // Fetch instance metadata
  useEffect(() => {
    const fetchInstance = async () => {
      try {
        const token = await getToken() || 'dev';
        const res = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const found = data.instances?.find((i: Instance) => i.id === instanceId);
          if (found) {
            setInstance(found);
            setInstanceName(found.name);
          }
        }
      } catch (err) {
        console.error('Failed to fetch instance:', err);
      }
    };
    fetchInstance();
  }, [projectId, instanceId, getToken]);

  // Fetch project data (for GitHub settings)
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const token = await getToken() || 'dev';
        const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      }
    };
    fetchProject();
  }, [projectId, getToken]);

  const handleUpdateInstanceName = useCallback(async () => {
    if (!instanceName.trim() || instanceName === instance?.name) {
      setEditingName(false);
      return;
    }
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/instances/${instanceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: instanceName })
      });
      if (res.ok) {
        const updated = await res.json();
        setInstance(prev => prev ? { ...prev, name: updated.name } : null);
        setInstanceName(updated.name);
      }
    } catch (err) {
      console.error('Failed to update instance name:', err);
    }
    setEditingName(false);
  }, [instanceName, instance?.name, instanceId, getToken]);

  return {
    instance,
    project,
    instanceName,
    editingName,
    setEditingName,
    setInstanceName,
    handleUpdateInstanceName
  };
}
