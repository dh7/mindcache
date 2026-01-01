'use client';

import { useMemo } from 'react';
import { GitStore, type GitStoreConfig } from '@mindcache/gitstore';

interface Project {
    github_repo?: string;
    github_branch?: string;
    github_path?: string;
}

/**
 * Token provider that fetches GitHub OAuth token from API
 */
async function tokenProvider(): Promise<string> {
  const res = await fetch('/api/github/token');
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch token' }));
    throw new Error(error.error || 'Failed to get GitHub token');
  }
  const { token } = await res.json();
  return token;
}

/**
 * Hook to create and use a GitStore instance for a project
 *
 * @param project - Project with GitHub configuration
 * @returns GitStore instance or null if not configured
 */
export function useGitStore(project: Project | null): GitStore | null {
  return useMemo(() => {
    if (!project?.github_repo) {
      return null;
    }

    const [owner, repo] = project.github_repo.split('/');
    if (!owner || !repo) {
      return null;
    }

    const config: GitStoreConfig = {
      owner,
      repo,
      branch: project.github_branch || 'main',
      basePath: project.github_path || '',
      tokenProvider
    };

    return new GitStore(config);
  }, [project?.github_repo, project?.github_branch, project?.github_path]);
}
