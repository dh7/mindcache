import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Octokit } from '@octokit/rest';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('github_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const octokit = new Octokit({ auth: token });
    
    // Get repos the user has push access to
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50,
      affiliation: 'owner,collaborator'
    });

    // Filter to repos with push permission
    const pushableRepos = repos
      .filter(repo => repo.permissions?.push)
      .map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        defaultBranch: repo.default_branch
      }));

    return NextResponse.json({ repos: pushableRepos });

  } catch (err) {
    console.error('Failed to list repos:', err);
    return NextResponse.json({ error: 'Failed to list repos' }, { status: 500 });
  }
}
