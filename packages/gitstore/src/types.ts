/**
 * GitStore Types
 *
 * Type definitions for the GitStore library.
 */

/**
 * Configuration for GitStore instance
 */
export interface GitStoreConfig {
    /** GitHub owner (username or organization) */
    owner: string;
    /** Repository name */
    repo: string;
    /** Branch to operate on (default: 'main') */
    branch?: string;
    /** Base path to scope all operations to a subdirectory */
    basePath?: string;
    /**
     * Async function that returns a GitHub access token.
     * This allows GitStore to work in different environments:
     * - Web apps: fetch token from API endpoint
     * - Server: return environment variable
     */
    tokenProvider: () => Promise<string>;
}

/**
 * A file or directory entry in the repository
 */
export interface FileEntry {
    /** File or directory name */
    name: string;
    /** Full path from repository root */
    path: string;
    /** Entry type */
    type: 'file' | 'dir';
    /** File size in bytes (only for files) */
    size?: number;
    /** Git blob SHA */
    sha: string;
}

/**
 * Result of a commit operation
 */
export interface CommitResult {
    /** Commit SHA */
    sha: string;
    /** URL to view the commit on GitHub */
    url: string;
    /** Commit message */
    message: string;
}

/**
 * A commit in the repository history
 */
export interface Commit {
    /** Commit SHA */
    sha: string;
    /** Commit message */
    message: string;
    /** Author information */
    author: {
        name: string;
        email: string;
        date: string;
    };
    /** URL to view the commit on GitHub */
    url: string;
}

/**
 * Read options
 */
export interface ReadOptions {
    /** Specific ref (branch, tag, commit) to read from */
    ref?: string;
}

/**
 * Write options
 */
export interface WriteOptions {
    /** Custom commit message */
    message?: string;
    /** Override branch for this operation */
    branch?: string;
}

// ============================================================================
// OAuth Types
// ============================================================================

/**
 * Configuration for GitStoreAuth
 */
export interface GitStoreAuthConfig {
    /** GitHub OAuth App client ID */
    clientId: string;
    /** GitHub OAuth App client secret (server-side only!) */
    clientSecret: string;
    /** OAuth callback URL (must match GitHub app settings) */
    redirectUri: string;
}

/**
 * OAuth scopes for GitHub
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
 */
export type GitHubScope =
    | 'repo'           // Full control of private repos
    | 'public_repo'    // Access public repos only
    | 'read:user'      // Read user profile
    | 'user:email'     // Read user email
    | 'gist'           // Create gists
    | 'read:org';      // Read org membership

/**
 * Options for generating OAuth URL
 */
export interface AuthUrlOptions {
    /** Requested OAuth scopes (default: ['repo']) */
    scopes?: GitHubScope[];
    /** Random state for CSRF protection (auto-generated if not provided) */
    state?: string;
    /** Allow user to select which account to use */
    allowSignup?: boolean;
}

/**
 * Result from OAuth token exchange
 */
export interface TokenResult {
    /** Access token for API calls */
    accessToken: string;
    /** Token type (usually 'bearer') */
    tokenType: string;
    /** OAuth scopes granted */
    scope: string;
    /** Refresh token (if using GitHub App, not OAuth App) */
    refreshToken?: string;
    /** Token expiration in seconds (if using GitHub App) */
    expiresIn?: number;
}

/**
 * GitHub user info
 */
export interface GitHubUser {
    /** GitHub user ID */
    id: number;
    /** GitHub username */
    login: string;
    /** Display name */
    name: string | null;
    /** Email (requires user:email scope) */
    email: string | null;
    /** Avatar URL */
    avatarUrl: string;
}
