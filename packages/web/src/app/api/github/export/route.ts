import { NextRequest, NextResponse } from 'next/server';
import { exportInstanceToGitHub } from '@/lib/github-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, branch, basePath, instanceName, markdown } = body;

    if (!owner || !repo || !instanceName || !markdown) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo, instanceName, markdown' },
        { status: 400 }
      );
    }

    const result = await exportInstanceToGitHub({
      owner,
      repo,
      branch: branch || 'main',
      basePath: basePath || '',
      instanceName,
      markdown
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('GitHub export error:', err);

    if (err.message?.includes('not authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (err.message?.includes('No GitHub OAuth token')) {
      return NextResponse.json(
        { error: 'GitHub not connected. Please re-authenticate with GitHub.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: err.message || 'Failed to export to GitHub' },
      { status: 500 }
    );
  }
}
