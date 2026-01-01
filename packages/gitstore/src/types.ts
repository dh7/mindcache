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
