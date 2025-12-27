import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRepoTree, getFileContent } from '@/lib/github-api';
import { MindCache } from 'mindcache/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ||
    API_URL.replace('http://', 'ws://').replace('https://', 'wss://');

export async function POST(request: NextRequest) {
  try {
    const { userId, getToken } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { owner, repo, branch, path, projectName } = body;

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo' },
        { status: 400 }
      );
    }

    // 1. Scan the folder for instance subdirectories with mindcache.md
    const items = await getRepoTree(owner, repo, branch || 'main', path || '');
    const instanceFolders = items.filter(item => item.type === 'dir');

    // Check each folder for mindcache.md
    const instancesToImport: Array<{ name: string; path: string }> = [];

    for (const folder of instanceFolders) {
      const folderContents = await getRepoTree(
        owner,
        repo,
        branch || 'main',
        folder.path
      );
      const hasMindcache = folderContents.some(
        item => item.name === 'mindcache.md' && item.type === 'file'
      );
      if (hasMindcache) {
        instancesToImport.push({
          name: folder.name,
          path: `${folder.path}/mindcache.md`
        });
      }
    }

    if (instancesToImport.length === 0) {
      return NextResponse.json(
        { error: 'No instances found. Looking for folders containing mindcache.md' },
        { status: 400 }
      );
    }

    // 2. Create the project via the server API
    const token = await getToken();
    const projectRes = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: projectName || `${repo} Import`,
        description: `Imported from ${owner}/${repo}`
      })
    });

    if (!projectRes.ok) {
      const err = await projectRes.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create project');
    }

    const project = await projectRes.json();

    // 3. Update project with GitHub settings
    const updateRes = await fetch(`${API_URL}/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        github_repo: `${owner}/${repo}`,
        github_branch: branch || 'main',
        github_path: path || ''
      })
    });

    if (!updateRes.ok) {
      // eslint-disable-next-line no-console
      console.error('Failed to update project with GitHub settings');
    }

    // 4. Create instances and import markdown content
    const importedInstances: Array<{ name: string; id: string }> = [];
    const errors: string[] = [];

    for (const instance of instancesToImport) {
      try {
        // Create instance
        const instanceRes = await fetch(
          `${API_URL}/api/projects/${project.id}/instances`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name: instance.name })
          }
        );

        if (!instanceRes.ok) {
          errors.push(`Failed to create instance: ${instance.name}`);
          continue;
        }

        const newInstance = await instanceRes.json();

        // Get markdown content from GitHub
        const markdown = await getFileContent(
          owner,
          repo,
          branch || 'main',
          instance.path
        );

        // Connect to MindCache instance and import markdown
        // eslint-disable-next-line no-console
        console.log(`[GitHub Import] Connecting to instance ${newInstance.id}...`);

        const mc = new MindCache({
          cloud: {
            instanceId: newInstance.id,
            projectId: project.id,
            baseUrl: WS_BASE_URL,
            tokenProvider: async () => {
              // Fetch WS token from server
              const res = await fetch(`${API_URL}/api/ws-token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ instanceId: newInstance.id })
              });
              if (!res.ok) {
                throw new Error('Failed to get WS token');
              }
              const data = await res.json();
              return data.token;
            }
          },
          accessLevel: 'system'
        });

        // Wait for sync with timeout
        // eslint-disable-next-line no-console
        console.log('[GitHub Import] Waiting for sync...');

        const syncTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Sync timeout after 10s')), 10000)
        );

        try {
          await Promise.race([mc.waitForSync(), syncTimeout]);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[GitHub Import] Sync failed:', e);
          mc.disconnect();
          throw e;
        }

        // eslint-disable-next-line no-console
        console.log(`[GitHub Import] Importing markdown for ${instance.name}...`);
        mc.fromMarkdown(markdown);

        // Give time for data to sync to DO
        await new Promise(resolve => setTimeout(resolve, 1000));
        mc.disconnect();

        // eslint-disable-next-line no-console
        console.log(`[GitHub Import] Successfully imported ${instance.name}`);

        importedInstances.push({ name: instance.name, id: newInstance.id });
      } catch (err) {
        const error = err as Error;
        errors.push(`${instance.name}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name
      },
      imported: importedInstances,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    // eslint-disable-next-line no-console
    console.error('GitHub import error:', err.message);

    if (err.message?.includes('No GitHub OAuth token')) {
      return NextResponse.json(
        { error: 'GitHub not connected. Please sign in with GitHub.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: err.message || 'Failed to import from GitHub' },
      { status: err.status || 500 }
    );
  }
}
