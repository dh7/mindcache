/**
 * GitStore - Git Repository Abstraction
 *
 * A TypeScript library for interacting with Git repositories through the GitHub API.
 * Provides file listing, reading, and writing capabilities with automatic commit handling.
 */

import { Octokit } from '@octokit/rest';
import type {
  GitStoreConfig,
  FileEntry,
  CommitResult,
  Commit,
  ReadOptions,
  WriteOptions
} from './types';

/**
 * GitStore provides an abstraction over a Git repository for file operations.
 *
 * @example
 * ```typescript
 * const store = new GitStore({
 *   owner: 'myorg',
 *   repo: 'myrepo',
 *   tokenProvider: async () => process.env.GITHUB_TOKEN!
 * });
 *
 * // List files
 * const files = await store.listFiles('docs');
 *
 * // Read a file
 * const content = await store.readFile('docs/readme.md');
 *
 * // Write a file (creates commit)
 * await store.writeFile('docs/new-file.md', '# New File');
 * ```
 */
export class GitStore {
  private config: Required<Omit<GitStoreConfig, 'tokenProvider'>> & Pick<GitStoreConfig, 'tokenProvider'>;
  private octokit: Octokit | null = null;

  constructor(config: GitStoreConfig) {
    this.config = {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch ?? 'main',
      basePath: config.basePath ?? '',
      tokenProvider: config.tokenProvider
    };
  }

  /**
     * Get or create an authenticated Octokit instance
     */
  private async getOctokit(): Promise<Octokit> {
    if (!this.octokit) {
      const token = await this.config.tokenProvider();
      this.octokit = new Octokit({ auth: token });
    }
    return this.octokit;
  }

  /**
     * Clear the cached Octokit instance (useful if token expires)
     */
  public clearAuth(): void {
    this.octokit = null;
  }

  /**
     * Resolve a path relative to the configured basePath
     */
  private resolvePath(path: string = ''): string {
    const parts = [this.config.basePath, path].filter(Boolean);
    return parts.join('/').replace(/^\/+/, '').replace(/\/+/g, '/');
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  /**
     * List files and directories at a given path
     *
     * @param path - Directory path relative to basePath (default: root)
     * @returns Array of file and directory entries
     */
  async listFiles(path: string = ''): Promise<FileEntry[]> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);

    try {
      const { data } = await octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: fullPath,
        ref: this.config.branch
      });

      // getContent returns an array for directories
      if (Array.isArray(data)) {
        return data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type as 'file' | 'dir',
          size: item.size,
          sha: item.sha
        }));
      }

      // Single file - return as array with one item
      return [{
        name: data.name,
        path: data.path,
        type: data.type as 'file' | 'dir',
        size: data.size,
        sha: data.sha
      }];
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return []; // Empty directory or doesn't exist
      }
      throw error;
    }
  }

  /**
     * Get the full tree of files in the repository
     *
     * @param recursive - If true, include all nested files (default: true)
     * @returns Array of all file entries
     */
  async getTree(recursive: boolean = true): Promise<FileEntry[]> {
    const octokit = await this.getOctokit();

    // Get the tree SHA for the branch
    const { data: ref } = await octokit.git.getRef({
      owner: this.config.owner,
      repo: this.config.repo,
      ref: `heads/${this.config.branch}`
    });

    const { data: commit } = await octokit.git.getCommit({
      owner: this.config.owner,
      repo: this.config.repo,
      commit_sha: ref.object.sha
    });

    const { data: tree } = await octokit.git.getTree({
      owner: this.config.owner,
      repo: this.config.repo,
      tree_sha: commit.tree.sha,
      recursive: recursive ? 'true' : undefined
    });

    // Filter to basePath if set
    const basePath = this.config.basePath;
    const entries = tree.tree
      .filter(item => {
        if (!basePath) {
          return true;
        }
        return item.path?.startsWith(basePath);
      })
      .map(item => ({
        name: item.path?.split('/').pop() ?? '',
        path: item.path ?? '',
        type: (item.type === 'tree' ? 'dir' : 'file') as 'file' | 'dir',
        size: item.size,
        sha: item.sha ?? ''
      }));

    return entries;
  }

  // ============================================================================
  // Reading
  // ============================================================================

  /**
     * Read a file's content as a string
     *
     * @param path - File path relative to basePath
     * @param options - Read options (e.g., specific ref)
     * @returns File content as string
     */
  async readFile(path: string, options?: ReadOptions): Promise<string> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);

    const { data } = await octokit.repos.getContent({
      owner: this.config.owner,
      repo: this.config.repo,
      path: fullPath,
      ref: options?.ref ?? this.config.branch
    });

    if (Array.isArray(data)) {
      throw new Error(`Path is a directory, not a file: ${fullPath}`);
    }

    if (!('content' in data)) {
      throw new Error(`File content not available: ${fullPath}`);
    }

    // Content is base64 encoded
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  /**
     * Read a file's content as an ArrayBuffer (for binary files)
     *
     * @param path - File path relative to basePath
     * @param options - Read options
     * @returns File content as ArrayBuffer
     */
  async readFileAsBuffer(path: string, options?: ReadOptions): Promise<ArrayBuffer> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);

    const { data } = await octokit.repos.getContent({
      owner: this.config.owner,
      repo: this.config.repo,
      path: fullPath,
      ref: options?.ref ?? this.config.branch
    });

    if (Array.isArray(data)) {
      throw new Error(`Path is a directory, not a file: ${fullPath}`);
    }

    if (!('content' in data)) {
      throw new Error(`File content not available: ${fullPath}`);
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(data.content, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  // ============================================================================
  // Writing
  // ============================================================================

  /**
     * Write a file to the repository (creates a commit)
     *
     * @param path - File path relative to basePath
     * @param content - File content as string
     * @param options - Write options (message, branch override)
     * @returns Commit result with SHA and URL
     */
  async writeFile(path: string, content: string, options?: WriteOptions): Promise<CommitResult> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);
    const branch = options?.branch ?? this.config.branch;
    const message = options?.message ?? `Update ${path}`;

    // Check if file exists to get its SHA (needed for updates)
    let sha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: fullPath,
        ref: branch
      });
      if (!Array.isArray(data) && 'sha' in data) {
        sha = data.sha;
      }
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status !== 404) {
        throw error;
      }
      // File doesn't exist, that's fine for creation
    }

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner: this.config.owner,
      repo: this.config.repo,
      path: fullPath,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha
    });

    return {
      sha: data.commit.sha ?? '',
      url: data.commit.html_url ?? '',
      message
    };
  }

  /**
     * Delete a file from the repository (creates a commit)
     *
     * @param path - File path relative to basePath
     * @param options - Write options (message, branch override)
     * @returns Commit result
     */
  async deleteFile(path: string, options?: WriteOptions): Promise<CommitResult> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);
    const branch = options?.branch ?? this.config.branch;
    const message = options?.message ?? `Delete ${path}`;

    // Get file SHA (required for deletion)
    const { data: fileData } = await octokit.repos.getContent({
      owner: this.config.owner,
      repo: this.config.repo,
      path: fullPath,
      ref: branch
    });

    if (Array.isArray(fileData)) {
      throw new Error(`Cannot delete directory: ${fullPath}`);
    }

    const { data } = await octokit.repos.deleteFile({
      owner: this.config.owner,
      repo: this.config.repo,
      path: fullPath,
      message,
      sha: fileData.sha,
      branch
    });

    return {
      sha: data.commit.sha ?? '',
      url: data.commit.html_url ?? '',
      message
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
     * Get commit history for a file or the repository
     *
     * @param path - Optional file path to get history for
     * @param limit - Maximum number of commits to return (default: 30)
     * @returns Array of commits
     */
  async getCommitHistory(path?: string, limit: number = 30): Promise<Commit[]> {
    const octokit = await this.getOctokit();
    const fullPath = path ? this.resolvePath(path) : undefined;

    const { data } = await octokit.repos.listCommits({
      owner: this.config.owner,
      repo: this.config.repo,
      sha: this.config.branch,
      path: fullPath,
      per_page: limit
    });

    return data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name ?? 'Unknown',
        email: commit.commit.author?.email ?? '',
        date: commit.commit.author?.date ?? ''
      },
      url: commit.html_url
    }));
  }

  /**
     * Get the SHA of a file (useful for checking if it changed)
     *
     * @param path - File path relative to basePath
     * @returns File SHA or null if file doesn't exist
     */
  async getFileSha(path: string): Promise<string | null> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);

    try {
      const { data } = await octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: fullPath,
        ref: this.config.branch
      });

      if (Array.isArray(data)) {
        return null; // It's a directory
      }

      return data.sha;
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
     * Check if a path exists in the repository
     *
     * @param path - Path to check
     * @returns True if path exists
     */
  async exists(path: string): Promise<boolean> {
    const octokit = await this.getOctokit();
    const fullPath = this.resolvePath(path);

    try {
      await octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: fullPath,
        ref: this.config.branch
      });
      return true;
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
     * Get repository metadata
     */
  get owner(): string {
    return this.config.owner;
  }

  get repo(): string {
    return this.config.repo;
  }

  get branch(): string {
    return this.config.branch;
  }

  get basePath(): string {
    return this.config.basePath;
  }
}
