import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GitStore } from '@mindcache/gitstore';

const NOTES_FILE = 'gitstore-notes.json';

async function getGitStore(owner: string, repo: string): Promise<GitStore | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('github_token')?.value;

  if (!token) {
    return null;
  }

  return new GitStore({
    owner,
    repo,
    tokenProvider: async () => token
  });
}

// GET - Load notes from repo
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');

  if (!owner || !repo) {
    return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
  }

  const store = await getGitStore(owner, repo);
  if (!store) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const exists = await store.exists(NOTES_FILE);
    if (!exists) {
      return NextResponse.json({ notes: [] });
    }

    const content = await store.readFile(NOTES_FILE);
    const data = JSON.parse(content);
    return NextResponse.json({ notes: data.notes || [] });

  } catch (err) {
    console.error('Failed to load notes:', err);
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 });
  }
}

// POST - Save notes to repo
export async function POST(request: NextRequest) {
  const { owner, repo, notes } = await request.json();

  if (!owner || !repo) {
    return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
  }

  const store = await getGitStore(owner, repo);
  if (!store) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const content = JSON.stringify({ 
      notes, 
      updatedAt: new Date().toISOString() 
    }, null, 2);

    const result = await store.writeFile(NOTES_FILE, content, {
      message: `Update notes via GitStore Notes app`
    });

    return NextResponse.json({ 
      success: true, 
      sha: result.sha,
      url: result.url 
    });

  } catch (err) {
    console.error('Failed to save notes:', err);
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
  }
}
