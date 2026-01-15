/**
 * GitStoreAuth - OAuth helpers for GitHub authentication
 *
 * Provides utilities for implementing GitHub OAuth flow in your application.
 * This is designed to work with server-side code (Next.js API routes, Express, etc.)
 *
 * @example
 * ```typescript
 * const auth = new GitStoreAuth({
 *   clientId: process.env.GITHUB_CLIENT_ID!,
 *   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 *   redirectUri: 'https://myapp.com/api/auth/github/callback'
 * });
 *
 * // 1. Generate login URL and redirect user
 * const { url, state } = auth.getAuthUrl({ scopes: ['repo'] });
 * // Store state in session for CSRF verification
 *
 * // 2. Handle callback - exchange code for token
 * const tokens = await auth.handleCallback(code);
 *
 * // 3. Create GitStore with the token
 * const store = auth.createGitStore({
 *   owner: 'user',
 *   repo: 'repo',
 *   token: tokens.accessToken
 * });
 * ```
 */

import { Octokit } from '@octokit/rest';
import { GitStore } from './GitStore';
import type {
  GitStoreAuthConfig,
  AuthUrlOptions,
  TokenResult,
  GitHubUser,
  GitHubScope
} from './types';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * GitStoreAuth provides OAuth authentication helpers for GitHub.
 *
 * IMPORTANT: This class uses client_secret and should only be used server-side.
 * Never expose your client_secret in client-side code.
 */
export class GitStoreAuth {
  private config: GitStoreAuthConfig;

  constructor(config: GitStoreAuthConfig) {
    this.config = config;
  }

  /**
   * Generate a GitHub OAuth authorization URL
   *
   * @param options - Auth URL options
   * @returns Object with URL to redirect to and state for CSRF verification
   *
   * @example
   * ```typescript
   * const { url, state } = auth.getAuthUrl({ scopes: ['repo'] });
   * // Store state in session, then redirect user to url
   * ```
   */
  getAuthUrl(options?: AuthUrlOptions): { url: string; state: string } {
    const scopes: GitHubScope[] = options?.scopes ?? ['repo'];
    const state = options?.state ?? this.generateState();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
      state
    });

    if (options?.allowSignup !== undefined) {
      params.set('allow_signup', String(options.allowSignup));
    }

    return {
      url: `${GITHUB_AUTHORIZE_URL}?${params.toString()}`,
      state
    };
  }

  /**
   * Exchange an authorization code for an access token
   *
   * Call this in your OAuth callback route after GitHub redirects back.
   *
   * @param code - The authorization code from GitHub callback
   * @returns Token result with access token
   *
   * @example
   * ```typescript
   * // In your callback route handler:
   * const code = request.query.code;
   * const tokens = await auth.handleCallback(code);
   * // Store tokens.accessToken securely (database, encrypted cookie, etc.)
   * ```
   */
  async handleCallback(code: string): Promise<TokenResult> {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  }

  /**
   * Refresh an access token (only works with GitHub Apps, not OAuth Apps)
   *
   * Note: Standard OAuth Apps don't support refresh tokens.
   * If you need refresh tokens, use a GitHub App instead.
   *
   * @param refreshToken - The refresh token
   * @returns New token result
   */
  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`GitHub refresh error: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  }

  /**
   * Get the authenticated user's information
   *
   * @param accessToken - Valid access token
   * @returns GitHub user info
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.users.getAuthenticated();

    return {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url
    };
  }

  /**
   * Validate an access token by making a test API call
   *
   * @param accessToken - Token to validate
   * @returns True if token is valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const octokit = new Octokit({ auth: accessToken });
      await octokit.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoke an access token
   *
   * @param accessToken - Token to revoke
   */
  async revokeToken(accessToken: string): Promise<void> {
    const response = await fetch(
      `https://api.github.com/applications/${this.config.clientId}/token`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
          ).toString('base64')}`
        },
        body: JSON.stringify({ access_token: accessToken })
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to revoke token: ${response.status}`);
    }
  }

  /**
   * Create a GitStore instance with the given token
   *
   * Convenience method to create a GitStore without manually setting up tokenProvider.
   *
   * @param options - GitStore options plus token
   * @returns Configured GitStore instance
   *
   * @example
   * ```typescript
   * const store = auth.createGitStore({
   *   owner: 'myorg',
   *   repo: 'myrepo',
   *   token: tokens.accessToken
   * });
   * ```
   */
  createGitStore(options: {
    owner: string;
    repo: string;
    token: string;
    branch?: string;
    basePath?: string;
  }): GitStore {
    return new GitStore({
      owner: options.owner,
      repo: options.repo,
      branch: options.branch,
      basePath: options.basePath,
      tokenProvider: async () => options.token
    });
  }

  /**
   * Generate a random state string for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get the configured client ID (safe to expose)
   */
  get clientId(): string {
    return this.config.clientId;
  }

  /**
   * Get the configured redirect URI
   */
  get redirectUri(): string {
    return this.config.redirectUri;
  }
}
