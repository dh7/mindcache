import { NextRequest, NextResponse } from 'next/server';
import { commitFile } from '@/lib/github-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, path, content, message, branch } = body;

    if (!owner || !repo || !path || !content || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo, path, content, message' },
        { status: 400 }
      );
    }

    const result = await commitFile({
      owner,
      repo,
      path,
      content,
      message,
      branch
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('GitHub commit error:', err);

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
      { error: err.message || 'Failed to commit file' },
      { status: 500 }
    );
  }
}
