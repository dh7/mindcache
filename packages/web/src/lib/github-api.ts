import { Octokit } from '@octokit/rest';
import { getGitHubToken } from './github';

/**
 * Creates an authenticated Octokit instance for the current user.
 */
export async function getOctokit(): Promise<Octokit> {
    const token = await getGitHubToken();
    return new Octokit({ auth: token });
}

/**
 * Returns information about the authenticated GitHub user.
 */
export async function getAuthenticatedUser() {
    const octokit = await getOctokit();
    const { data } = await octokit.users.getAuthenticated();
    return data;
}

/**
 * Commits a file to a GitHub repository.
 * Creates the file if it doesn't exist, updates it if it does.
 */
export async function commitFile({
    owner,
    repo,
    path,
    content,
    message,
    branch = 'main',
}: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
}) {
    const octokit = await getOctokit();

    // Check if file exists to get its SHA (needed for updates)
    let sha: string | undefined;
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref: branch,
        });
        if ('sha' in data) {
            sha = data.sha;
        }
    } catch (error: unknown) {
        const err = error as { status?: number };
        if (err.status !== 404) throw error;
        // File doesn't exist, that's fine for creation
    }

    const { data } = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
    });

    return data;
}

/**
 * Lists repositories accessible to the authenticated user.
 */
export async function listUserRepos() {
    const octokit = await getOctokit();
    const { data } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
    });
    return data;
}

/**
 * Exports a MindCache instance to GitHub as a markdown file.
 * Creates the file at: {basePath}/{instanceName}/mindcache.md
 */
export async function exportInstanceToGitHub({
    owner,
    repo,
    branch = 'main',
    basePath = '',
    instanceName,
    markdown,
    commitMessage,
}: {
    owner: string;
    repo: string;
    branch?: string;
    basePath?: string;
    instanceName: string;
    markdown: string;
    commitMessage?: string;
}) {
    // Build the file path: basePath/instanceName/mindcache.md
    const pathParts = [basePath, instanceName, 'mindcache.md'].filter(Boolean);
    const filePath = pathParts.join('/').replace(/^\/+/, ''); // Remove leading slashes

    const message = commitMessage || `Update ${instanceName} MindCache export`;

    return commitFile({
        owner,
        repo,
        path: filePath,
        content: markdown,
        message,
        branch,
    });
}
