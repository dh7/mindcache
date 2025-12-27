import { auth, clerkClient } from '@clerk/nextjs/server';

/**
 * Retrieves the GitHub OAuth access token for the currently authenticated user.
 * This token can be used to make authenticated requests to the GitHub API.
 * 
 * @throws Error if user is not authenticated or has no GitHub OAuth token
 */
export async function getGitHubToken(): Promise<string> {
    const { userId } = await auth();

    if (!userId) {
        throw new Error('User not authenticated');
    }

    const client = await clerkClient();
    const tokens = await client.users.getUserOauthAccessToken(userId, 'oauth_github');

    if (!tokens.data || tokens.data.length === 0) {
        throw new Error('No GitHub OAuth token available. User may need to re-authenticate with GitHub.');
    }

    return tokens.data[0].token;
}

/**
 * Checks if the current user has a valid GitHub OAuth token.
 * Useful for conditional UI rendering.
 */
export async function hasGitHubToken(): Promise<boolean> {
    try {
        await getGitHubToken();
        return true;
    } catch {
        return false;
    }
}
