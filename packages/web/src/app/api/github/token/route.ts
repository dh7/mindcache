import { NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/github';

/**
 * GET /api/github/token
 * Returns the GitHub OAuth token for the current user.
 * Used by GitStore's tokenProvider.
 */
export async function GET() {
  try {
    const token = await getGitHubToken();
    return NextResponse.json({ token });
  } catch (error: unknown) {
    const err = error as Error;

    if (err.message?.includes('not authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (err.message?.includes('No GitHub OAuth token')) {
      return NextResponse.json(
        { error: 'GitHub not connected. Please connect your GitHub account.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: err.message || 'Failed to get token' },
      { status: 500 }
    );
  }
}
