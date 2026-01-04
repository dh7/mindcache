/**
 * MindCache OAuth Client
 *
 * Browser-compatible OAuth 2.0 client for "Sign in with MindCache"
 * Supports PKCE for secure authorization
 */

export interface OAuthConfig {
    /** Client ID from developer portal */
    clientId: string;
    /** Redirect URI (defaults to current URL) */
    redirectUri?: string;
    /** Scopes to request (default: ['read', 'write']) */
    scopes?: string[];
    /** MindCache authorize URL (default: production) */
    authUrl?: string;
    /** MindCache token URL (default: production) */
    tokenUrl?: string;
    /** Use PKCE for security (default: true) */
    usePKCE?: boolean;
    /** Storage key prefix (default: 'mindcache_oauth') */
    storagePrefix?: string;
}

export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scopes: string[];
    instanceId?: string;
}

export interface MindCacheUser {
    id: string;
    email?: string;
    name?: string;
    instanceId?: string;
}

const DEFAULT_AUTH_URL = 'https://api.mindcache.dev/oauth/authorize';
const DEFAULT_TOKEN_URL = 'https://api.mindcache.dev/oauth/token';
const DEFAULT_USERINFO_URL = 'https://api.mindcache.dev/oauth/userinfo';
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 min before expiry

/**
 * Generate cryptographically secure random string
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Base64 URL encode a buffer
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE code verifier
 */
function generateCodeVerifier(): string {
  return generateRandomString(64);
}

/**
 * Generate PKCE code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(hash);
}

/**
 * OAuth client for browser applications
 *
 * @example
 * ```typescript
 * const oauth = new OAuthClient({ clientId: 'mc_app_abc123' });
 *
 * // Start OAuth flow
 * await oauth.authorize();
 *
 * // Handle callback (on redirect page)
 * const tokens = await oauth.handleCallback();
 *
 * // Get access token for API calls
 * const token = await oauth.getAccessToken();
 * ```
 */
export class OAuthClient {
  private config: Required<OAuthConfig>;
  private tokens: OAuthTokens | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(config: OAuthConfig) {
    // Determine redirect URI
    let redirectUri = config.redirectUri;
    if (!redirectUri && typeof window !== 'undefined') {
      // Default to current URL without query params
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      redirectUri = url.toString();
    }

    this.config = {
      clientId: config.clientId,
      redirectUri: redirectUri || '',
      scopes: config.scopes || ['read', 'write'],
      authUrl: config.authUrl || DEFAULT_AUTH_URL,
      tokenUrl: config.tokenUrl || DEFAULT_TOKEN_URL,
      usePKCE: config.usePKCE !== false, // Default true
      storagePrefix: config.storagePrefix || 'mindcache_oauth'
    };

    // Load stored tokens
    this.loadTokens();
  }

  /**
     * Check if user is authenticated
     */
  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.expiresAt > Date.now();
  }

  /**
     * Get stored tokens (if any)
     */
  getTokens(): OAuthTokens | null {
    return this.tokens;
  }

  /**
     * Get instance ID for this user+app
     */
  getInstanceId(): string | null {
    return this.tokens?.instanceId || null;
  }

  /**
     * Start OAuth authorization flow
     * Redirects to MindCache authorization page
     */
  async authorize(options?: { popup?: boolean; state?: string }): Promise<void> {
    const state = options?.state || generateRandomString(32);

    // Store state for validation
    this.setStorage('state', state);

    // Build authorization URL
    const url = new URL(this.config.authUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', state);

    // PKCE
    if (this.config.usePKCE) {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      this.setStorage('code_verifier', codeVerifier);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    // Redirect to authorization
    if (options?.popup) {
      // Open popup (not recommended but supported)
      const popup = window.open(url.toString(), 'mindcache_oauth', 'width=500,height=600');
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
    } else {
      // Full page redirect (recommended)
      window.location.href = url.toString();
    }
  }

  /**
     * Handle OAuth callback
     * Call this on your redirect URI page
     *
     * @returns Tokens if successful
     */
  async handleCallback(): Promise<OAuthTokens> {
    if (typeof window === 'undefined') {
      throw new Error('handleCallback must be called in browser');
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // Check for error
    if (error) {
      this.clearStorage();
      throw new Error(errorDescription || error);
    }

    // Validate state
    const storedState = this.getStorage('state');
    if (!state || state !== storedState) {
      this.clearStorage();
      throw new Error('Invalid state parameter');
    }

    // Validate code
    if (!code) {
      this.clearStorage();
      throw new Error('No authorization code received');
    }

    // Build token request
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri
    };

    // Add PKCE verifier
    if (this.config.usePKCE) {
      const codeVerifier = this.getStorage('code_verifier');
      if (!codeVerifier) {
        throw new Error('Missing code verifier');
      }
      body.code_verifier = codeVerifier;
    }

    // Exchange code for tokens
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    const data = await response.json();

    // Store tokens
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      scopes: data.scope?.split(' ') || this.config.scopes,
      instanceId: data.instance_id
    };

    this.saveTokens();

    // Clean up URL
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());

    // Clear temporary storage
    this.removeStorage('state');
    this.removeStorage('code_verifier');

    return this.tokens;
  }

  /**
     * Get a valid access token
     * Automatically refreshes if needed
     */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('Not authenticated. Call authorize() first.');
    }

    // Check if token needs refresh
    const needsRefresh = this.tokens.expiresAt - Date.now() < TOKEN_REFRESH_BUFFER;

    if (needsRefresh && this.tokens.refreshToken) {
      // Avoid concurrent refresh attempts
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshTokens();
      }
      return this.refreshPromise;
    }

    return this.tokens.accessToken;
  }

  /**
     * Refresh access token
     */
  private async refreshTokens(): Promise<string> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refreshToken,
          client_id: this.config.clientId
        })
      });

      if (!response.ok) {
        // Refresh failed - user needs to re-authenticate
        this.clearAuth();
        throw new Error('Session expired. Please sign in again.');
      }

      const data = await response.json();

      this.tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.tokens.refreshToken,
        expiresAt: Date.now() + (data.expires_in * 1000),
        scopes: data.scope?.split(' ') || this.tokens.scopes,
        instanceId: data.instance_id || this.tokens.instanceId
      };

      this.saveTokens();
      return this.tokens.accessToken;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
     * Get user info from MindCache
     */
  async getUserInfo(): Promise<MindCacheUser> {
    const token = await this.getAccessToken();

    const response = await fetch(DEFAULT_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const data = await response.json();
    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      instanceId: data.instance_id
    };
  }

  /**
     * Logout - revoke tokens and clear storage
     */
  async logout(): Promise<void> {
    if (this.tokens?.accessToken) {
      try {
        // Try to revoke token (best effort)
        await fetch(this.config.tokenUrl.replace('/token', '/revoke'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: this.tokens.accessToken
          })
        });
      } catch {
        // Ignore revoke errors
      }
    }

    this.clearAuth();
  }

  /**
     * Clear authentication state
     */
  private clearAuth(): void {
    this.tokens = null;
    this.removeStorage('tokens');
  }

  /**
     * Token provider function for MindCache cloud config
     * Use this with MindCacheCloudOptions.tokenProvider
     */
  tokenProvider = async (): Promise<string> => {
    return this.getAccessToken();
  };

  // Storage helpers
  private getStorage(key: string): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(`${this.config.storagePrefix}_${key}`);
  }

  private setStorage(key: string, value: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(`${this.config.storagePrefix}_${key}`, value);
  }

  private removeStorage(key: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(`${this.config.storagePrefix}_${key}`);
  }

  private clearStorage(): void {
    this.removeStorage('state');
    this.removeStorage('code_verifier');
    this.removeStorage('tokens');
  }

  private loadTokens(): void {
    const stored = this.getStorage('tokens');
    if (stored) {
      try {
        this.tokens = JSON.parse(stored);
      } catch {
        this.tokens = null;
      }
    }
  }

  private saveTokens(): void {
    if (this.tokens) {
      this.setStorage('tokens', JSON.stringify(this.tokens));
    }
  }
}

/**
 * Create OAuth client with environment-appropriate defaults
 */
export function createOAuthClient(config: OAuthConfig): OAuthClient {
  return new OAuthClient(config);
}
