import { NextRequest, NextResponse } from 'next/server';
import { listUserRepos, listBranches, getRepoTree } from '@/lib/github-api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action parameter' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'repos': {
        const repos = await listUserRepos();
        return NextResponse.json({
          repos: repos.map(r => ({
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            private: r.private,
            default_branch: r.default_branch
          }))
        });
      }

      case 'branches': {
        const owner = searchParams.get('owner');
        const repo = searchParams.get('repo');

        if (!owner || !repo) {
          return NextResponse.json(
            { error: 'Missing owner or repo parameter' },
            { status: 400 }
          );
        }

        const branches = await listBranches(owner, repo);
        return NextResponse.json({
          branches: branches.map(b => ({
            name: b.name
          }))
        });
      }

      case 'tree': {
        const owner = searchParams.get('owner');
        const repo = searchParams.get('repo');
        const branch = searchParams.get('branch') || 'main';
        const path = searchParams.get('path') || '';

        if (!owner || !repo) {
          return NextResponse.json(
            { error: 'Missing owner or repo parameter' },
            { status: 400 }
          );
        }

        const items = await getRepoTree(owner, repo, branch, path);
        return NextResponse.json({ items });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    // eslint-disable-next-line no-console
    console.error('GitHub browse error:', err.message);

    if (err.message?.includes('No GitHub OAuth token')) {
      return NextResponse.json(
        { error: 'GitHub not connected. Please sign in with GitHub.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: err.message || 'Failed to browse GitHub' },
      { status: err.status || 500 }
    );
  }
}
