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
    const err = error as Error & { status?: number; response?: { data?: { message?: string } } };
    // eslint-disable-next-line no-console
    console.error('GitHub export error:', {
      message: err.message,
      status: err.status,
      response: err.response?.data
    });

    if (err.message?.includes('not authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (err.message?.includes('No GitHub OAuth token')) {
      return NextResponse.json(
        { error: 'GitHub not connected. Please re-authenticate with GitHub.' },
        { status: 403 }
      );
    }

    // Include more details in the error response
    const errorMessage = err.response?.data?.message || err.message || 'Failed to export to GitHub';
    return NextResponse.json(
      { error: errorMessage },
      { status: err.status || 500 }
    );
  }
}
