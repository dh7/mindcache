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
      ...options?.headers
    }
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
    body: JSON.stringify({ name, description })
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
    body: JSON.stringify({ name, cloneFrom })
  });
}

// ============= SHARES =============

interface Share {
  id: string;
  target_type: 'user' | 'public';
  target_id?: string;
  target_email?: string;
  target_name?: string;
  permission: 'read' | 'write' | 'admin';
  created_at: number;
}

export async function listShares(
  token: string,
  resourceType: 'projects' | 'instances',
  resourceId: string
): Promise<Share[]> {
  const data = await fetchApi<{ shares: Share[] }>(
    `/api/${resourceType}/${resourceId}/shares`,
    token
  );
  return data.shares;
}

export async function createShare(
  token: string,
  resourceType: 'projects' | 'instances',
  resourceId: string,
  share: { targetType: 'user' | 'public'; targetEmail?: string; permission: 'read' | 'write' | 'admin' }
): Promise<Share> {
  return fetchApi<Share>(`/api/${resourceType}/${resourceId}/shares`, token, {
    method: 'POST',
    body: JSON.stringify(share)
  });
}

export async function deleteShare(token: string, shareId: string): Promise<void> {
  await fetchApi(`/api/shares/${shareId}`, token, { method: 'DELETE' });
}

// ============= API KEYS =============

interface ApiKey {
  id: string;
  name: string;
  key?: string; // Only returned on creation
  key_prefix: string;
  scope_type: 'account' | 'project' | 'instance';
  scope_id?: string;
  permissions: string[];
  created_at: number;
  last_used_at?: number;
}

export async function listApiKeys(token: string): Promise<ApiKey[]> {
  const data = await fetchApi<{ keys: ApiKey[] }>('/api/keys', token);
  return data.keys;
}

export async function createApiKey(
  token: string,
  key: { name: string; scopeType: 'account' | 'project' | 'instance'; scopeId?: string; permissions: string[] }
): Promise<ApiKey> {
  return fetchApi<ApiKey>('/api/keys', token, {
    method: 'POST',
    body: JSON.stringify(key)
  });
}

export async function deleteApiKey(token: string, keyId: string): Promise<void> {
  await fetchApi(`/api/keys/${keyId}`, token, { method: 'DELETE' });
}

export type { Project, Instance, Share, ApiKey };

