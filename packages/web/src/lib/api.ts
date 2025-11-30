/**
 * MindCache API client for the web app
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
  defaultInstanceId?: string;
}

interface Instance {
  id: string;
  project_id: string;
  name: string;
  is_readonly: boolean;
  created_at: number;
  updated_at: number;
}

async function fetchApi<T>(
  path: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  return res.json();
}

export async function listProjects(token: string): Promise<Project[]> {
  // In dev mode without Clerk, use 'dev' token
  const actualToken = token || 'dev';
  const data = await fetchApi<{ projects: Project[] }>('/api/projects', actualToken);
  return data.projects;
}

export async function createProject(
  token: string,
  name: string,
  description?: string
): Promise<Project> {
  return fetchApi<Project>('/api/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteProject(token: string, projectId: string): Promise<void> {
  await fetchApi(`/api/projects/${projectId}`, token, { method: 'DELETE' });
}

export async function listInstances(token: string, projectId: string): Promise<Instance[]> {
  const data = await fetchApi<{ instances: Instance[] }>(
    `/api/projects/${projectId}/instances`,
    token
  );
  return data.instances;
}

export async function createInstance(
  token: string,
  projectId: string,
  name: string,
  cloneFrom?: string
): Promise<Instance> {
  return fetchApi<Instance>(`/api/projects/${projectId}/instances`, token, {
    method: 'POST',
    body: JSON.stringify({ name, cloneFrom }),
  });
}

export type { Project, Instance };

