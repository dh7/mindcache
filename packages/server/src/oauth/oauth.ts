/**
 * MindCache OAuth 2.0 Provider
 *
 * Implements OAuth 2.0 Authorization Code flow with PKCE support.
 * Enables "Sign in with MindCache" for third-party apps.
 */

import { hashSecret, generateSecureSecret } from '../auth/clerk';

// Types
export interface OAuthApp {
    id: string;
    owner_user_id: string;
    name: string;
    description: string | null;
    client_id: string;
    redirect_uris: string[];
    scopes: string[];
    logo_url: string | null;
    homepage_url: string | null;
    is_active: number;
    created_at: number;
    updated_at: number;
}

export interface OAuthTokenResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token?: string;
    scope: string;
    instance_id?: string;
}

export interface OAuthUserInfo {
    sub: string;          // User ID
    email?: string;
    name?: string;
    instance_id?: string; // Auto-provisioned instance for this app
}

// Constants
const AUTH_CODE_EXPIRY = 10 * 60;           // 10 minutes
const ACCESS_TOKEN_EXPIRY = 60 * 60;        // 1 hour
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days

const VALID_SCOPES = ['read', 'write', 'admin', 'profile', 'github_sync'];

// Utility: Hash token for storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Utility: Generate secure token
function generateToken(prefix: string = 'mc'): string {
  return `${prefix}_${generateSecureSecret(32)}`;
}

// Utility: Base64 URL encode
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

// Utility: Verify PKCE code challenge
async function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): Promise<boolean> {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }

  if (method === 'S256') {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
    const computed = base64UrlEncode(hash);
    return computed === codeChallenge;
  }

  return false;
}

// Utility: Parse scopes
function parseScopes(scopeString: string | null): string[] {
  if (!scopeString) {
    return ['read'];
  }
  return scopeString.split(' ').filter(s => VALID_SCOPES.includes(s));
}

// Utility: Validate redirect URI
function isValidRedirectUri(uri: string, allowedUris: string[]): boolean {
  // Exact match
  if (allowedUris.includes(uri)) {
    return true;
  }

  // For localhost development, allow any port
  try {
    const parsed = new URL(uri);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      // Check if localhost is allowed (any port)
      return allowedUris.some(allowed => {
        try {
          const allowedParsed = new URL(allowed);
          return (allowedParsed.hostname === 'localhost' || allowedParsed.hostname === '127.0.0.1') &&
                        allowedParsed.pathname === parsed.pathname;
        } catch {
          return false;
        }
      });
    }
  } catch {
    return false;
  }

  return false;
}

// OAuth error response
function oauthError(
  error: string,
  description: string,
  redirectUri?: string,
  state?: string,
  asJson: boolean = false
): Response {
  if (redirectUri && !asJson) {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (state) {
      url.searchParams.set('state', state);
    }
    return Response.redirect(url.toString(), 302);
  }

  return Response.json(
    { error, error_description: description },
    {
      status: error === 'invalid_client' ? 401 : 400,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Handle GET /oauth/authorize
 * Authorization endpoint - generates authorization page or code
 */
export async function handleOAuthAuthorize(
  request: Request,
  db: D1Database,
  userId: string | null,
  webAppUrl: string
): Promise<Response> {
  const url = new URL(request.url);

  // Parse OAuth parameters
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const scope = url.searchParams.get('scope');
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') || 'S256';

  // Validate required parameters
  if (!clientId) {
    return oauthError('invalid_request', 'client_id is required', undefined, undefined, true);
  }

  if (responseType !== 'code') {
    return oauthError('unsupported_response_type', 'Only code response type is supported', redirectUri || undefined, state || undefined);
  }

  // Look up OAuth app
  const app = await db.prepare(`
    SELECT id, name, description, client_id, redirect_uris, scopes, logo_url, homepage_url, is_active
    FROM oauth_apps
    WHERE client_id = ?
  `).bind(clientId).first<{
        id: string;
        name: string;
        description: string | null;
        client_id: string;
        redirect_uris: string;
        scopes: string;
        logo_url: string | null;
        homepage_url: string | null;
        is_active: number;
    }>();

  if (!app || !app.is_active) {
    return oauthError('invalid_client', 'Unknown or inactive client', undefined, undefined, true);
  }

  const allowedRedirectUris: string[] = JSON.parse(app.redirect_uris || '[]');
  const allowedScopes: string[] = JSON.parse(app.scopes || '["read"]');

  // Validate redirect URI
  if (!redirectUri || !isValidRedirectUri(redirectUri, allowedRedirectUris)) {
    return oauthError('invalid_request', 'Invalid redirect_uri', undefined, undefined, true);
  }

  // Validate scopes
  const requestedScopes = parseScopes(scope);
  const grantedScopes = requestedScopes.filter(s => allowedScopes.includes(s));

  if (grantedScopes.length === 0) {
    return oauthError('invalid_scope', 'No valid scopes requested', redirectUri, state || undefined);
  }

  // If user is not logged in, redirect to login with return URL
  if (!userId) {
    const loginUrl = new URL(`${webAppUrl}/sign-in`);
    loginUrl.searchParams.set('redirect_url', request.url);
    return Response.redirect(loginUrl.toString(), 302);
  }

  // Check if user has already authorized this app with these scopes
  const existingAuth = await db.prepare(`
    SELECT scopes FROM oauth_authorizations
    WHERE user_id = ? AND client_id = ?
  `).bind(userId, clientId).first<{ scopes: string }>();

  const previousScopes: string[] = existingAuth ? JSON.parse(existingAuth.scopes) : [];
  const hasAllScopes = grantedScopes.every(s => previousScopes.includes(s));

  // If already authorized with same/more scopes, skip consent and issue code
  if (hasAllScopes) {
    return issueAuthCode(db, userId, clientId, redirectUri, grantedScopes, codeChallenge, codeChallengeMethod, state);
  }

  // Otherwise, redirect to consent page in webapp
  const consentUrl = new URL(`${webAppUrl}/oauth/consent`);
  consentUrl.searchParams.set('client_id', clientId);
  consentUrl.searchParams.set('redirect_uri', redirectUri);
  consentUrl.searchParams.set('scope', grantedScopes.join(' '));
  if (state) {
    consentUrl.searchParams.set('state', state);
  }
  if (codeChallenge) {
    consentUrl.searchParams.set('code_challenge', codeChallenge);
  }
  if (codeChallengeMethod) {
    consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
  }

  return Response.redirect(consentUrl.toString(), 302);
}

/**
 * Handle POST /oauth/authorize
 * User has approved authorization (from consent page)
 */
export async function handleOAuthAuthorizeApproval(
  request: Request,
  db: D1Database,
  userId: string
): Promise<Response> {
  const body = await request.json() as {
        client_id: string;
        redirect_uri: string;
        scope: string;
        state?: string;
        code_challenge?: string;
        code_challenge_method?: string;
        approved: boolean;
    };

  if (!body.approved) {
    return oauthError('access_denied', 'User denied authorization', body.redirect_uri, body.state);
  }

  // Validate app exists
  const app = await db.prepare(`
    SELECT redirect_uris, scopes FROM oauth_apps WHERE client_id = ? AND is_active = 1
  `).bind(body.client_id).first<{ redirect_uris: string; scopes: string }>();

  if (!app) {
    return oauthError('invalid_client', 'Unknown client', undefined, undefined, true);
  }

  const allowedRedirectUris: string[] = JSON.parse(app.redirect_uris);
  if (!isValidRedirectUri(body.redirect_uri, allowedRedirectUris)) {
    return oauthError('invalid_request', 'Invalid redirect_uri', undefined, undefined, true);
  }

  const grantedScopes = parseScopes(body.scope);

  // Save authorization for future (skip consent next time)
  await db.prepare(`
    INSERT INTO oauth_authorizations (id, user_id, client_id, scopes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, client_id) 
    DO UPDATE SET scopes = ?, updated_at = unixepoch()
  `).bind(
    crypto.randomUUID(),
    userId,
    body.client_id,
    JSON.stringify(grantedScopes),
    JSON.stringify(grantedScopes)
  ).run();

  // Issue authorization code
  return issueAuthCode(
    db,
    userId,
    body.client_id,
    body.redirect_uri,
    grantedScopes,
    body.code_challenge || null,
    body.code_challenge_method || null,
    body.state || null
  );
}

/**
 * Issue authorization code and redirect
 */
async function issueAuthCode(
  db: D1Database,
  userId: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  codeChallenge: string | null,
  codeChallengeMethod: string | null,
  state: string | null
): Promise<Response> {
  const code = generateToken('mc_code');
  const codeHash = await hashToken(code);
  const expiresAt = Math.floor(Date.now() / 1000) + AUTH_CODE_EXPIRY;

  await db.prepare(`
    INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    codeHash,
    clientId,
    userId,
    redirectUri,
    JSON.stringify(scopes),
    codeChallenge,
    codeChallengeMethod,
    expiresAt
  ).run();

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('code', code);
  if (state) {
    callbackUrl.searchParams.set('state', state);
  }

  return Response.redirect(callbackUrl.toString(), 302);
}

/**
 * Handle POST /oauth/token
 * Token endpoint - exchange code for tokens or refresh tokens
 */
export async function handleOAuthToken(
  request: Request,
  db: D1Database,
  doNamespace: DurableObjectNamespace
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // Parse form data or JSON
  let body: Record<string, string>;
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } else {
    body = await request.json() as Record<string, string>;
  }

  const grantType = body.grant_type;

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(body, db, doNamespace, corsHeaders);
  } else if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(body, db, doNamespace, corsHeaders);
  } else {
    return Response.json(
      { error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported' },
      { status: 400, headers: corsHeaders }
    );
  }
}

/**
 * Handle authorization_code grant type
 */
async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  db: D1Database,
  doNamespace: DurableObjectNamespace,
  headers: Record<string, string>
): Promise<Response> {
  const { code, client_id, client_secret, redirect_uri, code_verifier } = body;

  if (!code || !client_id || !redirect_uri) {
    return Response.json(
      { error: 'invalid_request', error_description: 'code, client_id, and redirect_uri are required' },
      { status: 400, headers }
    );
  }

  // Look up authorization code
  const codeHash = await hashToken(code);
  const authCode = await db.prepare(`
    SELECT client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at
    FROM oauth_codes
    WHERE code_hash = ?
  `).bind(codeHash).first<{
        client_id: string;
        user_id: string;
        redirect_uri: string;
        scopes: string;
        code_challenge: string | null;
        code_challenge_method: string | null;
        expires_at: number;
    }>();

  if (!authCode) {
    return Response.json(
      { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
      { status: 400, headers }
    );
  }

  // Delete code immediately (one-time use)
  await db.prepare('DELETE FROM oauth_codes WHERE code_hash = ?').bind(codeHash).run();

  // Validate code hasn't expired
  if (authCode.expires_at < Math.floor(Date.now() / 1000)) {
    return Response.json(
      { error: 'invalid_grant', error_description: 'Authorization code has expired' },
      { status: 400, headers }
    );
  }

  // Validate client_id matches
  if (authCode.client_id !== client_id) {
    return Response.json(
      { error: 'invalid_grant', error_description: 'Client ID mismatch' },
      { status: 400, headers }
    );
  }

  // Validate redirect_uri matches
  if (authCode.redirect_uri !== redirect_uri) {
    return Response.json(
      { error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
      { status: 400, headers }
    );
  }

  // Verify PKCE if code_challenge was used
  if (authCode.code_challenge) {
    if (!code_verifier) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'code_verifier is required for PKCE' },
        { status: 400, headers }
      );
    }

    const valid = await verifyPKCE(code_verifier, authCode.code_challenge, authCode.code_challenge_method || 'S256');
    if (!valid) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'Invalid code_verifier' },
        { status: 400, headers }
      );
    }
  } else if (client_secret) {
    // Verify client secret for confidential clients
    const app = await db.prepare(`
      SELECT client_secret_hash FROM oauth_apps WHERE client_id = ?
    `).bind(client_id).first<{ client_secret_hash: string }>();

    if (!app) {
      return Response.json(
        { error: 'invalid_client', error_description: 'Unknown client' },
        { status: 401, headers }
      );
    }

    const secretHash = await hashSecret(client_secret);
    if (secretHash !== app.client_secret_hash) {
      return Response.json(
        { error: 'invalid_client', error_description: 'Invalid client secret' },
        { status: 401, headers }
      );
    }
  }

  // Get or create auto-provisioned instance for this user+app
  const instanceId = await getOrCreateUserInstance(db, authCode.user_id, client_id, doNamespace);

  // Issue tokens
  const scopes: string[] = JSON.parse(authCode.scopes);
  return issueTokens(db, authCode.user_id, client_id, scopes, instanceId, headers);
}

/**
 * Handle refresh_token grant type
 */
async function handleRefreshTokenGrant(
  body: Record<string, string>,
  db: D1Database,
  doNamespace: DurableObjectNamespace,
  headers: Record<string, string>
): Promise<Response> {
  const { refresh_token, client_id, client_secret } = body;

  if (!refresh_token || !client_id) {
    return Response.json(
      { error: 'invalid_request', error_description: 'refresh_token and client_id are required' },
      { status: 400, headers }
    );
  }

  // Look up refresh token
  const tokenHash = await hashToken(refresh_token);
  const refreshTokenData = await db.prepare(`
    SELECT rt.id, rt.access_token_id, rt.user_id, rt.expires_at, rt.revoked_at,
           at.scopes, at.instance_id
    FROM oauth_refresh_tokens rt
    JOIN oauth_tokens at ON at.id = rt.access_token_id
    WHERE rt.token_hash = ? AND rt.client_id = ?
  `).bind(tokenHash, client_id).first<{
        id: string;
        access_token_id: string;
        user_id: string;
        expires_at: number | null;
        revoked_at: number | null;
        scopes: string;
        instance_id: string | null;
    }>();

  if (!refreshTokenData || refreshTokenData.revoked_at) {
    return Response.json(
      { error: 'invalid_grant', error_description: 'Invalid or revoked refresh token' },
      { status: 400, headers }
    );
  }

  // Check expiry
  if (refreshTokenData.expires_at && refreshTokenData.expires_at < Math.floor(Date.now() / 1000)) {
    return Response.json(
      { error: 'invalid_grant', error_description: 'Refresh token has expired' },
      { status: 400, headers }
    );
  }

  // Verify client secret for confidential clients
  if (client_secret) {
    const app = await db.prepare(`
      SELECT client_secret_hash FROM oauth_apps WHERE client_id = ?
    `).bind(client_id).first<{ client_secret_hash: string }>();

    if (app) {
      const secretHash = await hashSecret(client_secret);
      if (secretHash !== app.client_secret_hash) {
        return Response.json(
          { error: 'invalid_client', error_description: 'Invalid client secret' },
          { status: 401, headers }
        );
      }
    }
  }

  // Revoke old refresh token (rotation)
  await db.prepare(`
    UPDATE oauth_refresh_tokens SET revoked_at = unixepoch() WHERE id = ?
  `).bind(refreshTokenData.id).run();

  // Get or ensure instance exists
  const instanceId = refreshTokenData.instance_id ||
        await getOrCreateUserInstance(db, refreshTokenData.user_id, client_id, doNamespace);

  // Issue new tokens
  const scopes: string[] = JSON.parse(refreshTokenData.scopes);
  return issueTokens(db, refreshTokenData.user_id, client_id, scopes, instanceId, headers);
}

/**
 * Issue access and refresh tokens
 */
async function issueTokens(
  db: D1Database,
  userId: string,
  clientId: string,
  scopes: string[],
  instanceId: string,
  headers: Record<string, string>
): Promise<Response> {
  const accessToken = generateToken('mc_at');
  const refreshToken = generateToken('mc_rt');

  const accessTokenId = crypto.randomUUID();
  const refreshTokenId = crypto.randomUUID();

  const accessTokenHash = await hashToken(accessToken);
  const refreshTokenHash = await hashToken(refreshToken);

  const now = Math.floor(Date.now() / 1000);
  const accessExpiresAt = now + ACCESS_TOKEN_EXPIRY;
  const refreshExpiresAt = now + REFRESH_TOKEN_EXPIRY;

  // Insert access token
  await db.prepare(`
    INSERT INTO oauth_tokens (id, token_hash, client_id, user_id, instance_id, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    accessTokenId,
    accessTokenHash,
    clientId,
    userId,
    instanceId,
    JSON.stringify(scopes),
    accessExpiresAt
  ).run();

  // Insert refresh token
  await db.prepare(`
    INSERT INTO oauth_refresh_tokens (id, token_hash, access_token_id, client_id, user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    refreshTokenId,
    refreshTokenHash,
    accessTokenId,
    clientId,
    userId,
    refreshExpiresAt
  ).run();

  const response: OAuthTokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
    instance_id: instanceId
  };

  return Response.json(response, { headers });
}

/**
 * Get or create auto-provisioned instance for user+app
 */
async function getOrCreateUserInstance(
  db: D1Database,
  userId: string,
  clientId: string,
  doNamespace: DurableObjectNamespace
): Promise<string> {
  // Check if instance already exists
  const existing = await db.prepare(`
    SELECT instance_id FROM oauth_user_instances
    WHERE user_id = ? AND client_id = ?
  `).bind(userId, clientId).first<{ instance_id: string }>();

  if (existing) {
    return existing.instance_id;
  }

  // Get app info for naming
  const app = await db.prepare(`
    SELECT name FROM oauth_apps WHERE client_id = ?
  `).bind(clientId).first<{ name: string }>();

  const appName = app?.name || 'Unknown App';

  // Get or create "OAuth Apps" project for this user
  let projectId: string;
  const existingProject = await db.prepare(`
    SELECT id FROM projects WHERE owner_id = ? AND name = 'OAuth Apps'
  `).bind(userId).first<{ id: string }>();

  if (existingProject) {
    projectId = existingProject.id;
  } else {
    projectId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO projects (id, owner_id, name, description)
      VALUES (?, ?, 'OAuth Apps', 'Auto-created project for third-party app data')
    `).bind(projectId, userId).run();
  }

  // Create instance
  const instanceId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO instances (id, project_id, owner_id, name)
    VALUES (?, ?, ?, ?)
  `).bind(instanceId, projectId, userId, `${appName} Data`).run();

  // Map instance to user+app
  await db.prepare(`
    INSERT INTO oauth_user_instances (id, user_id, client_id, instance_id, project_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, clientId, instanceId, projectId).run();

  // Create DO ownership and permissions
  const doId = doNamespace.idFromName(instanceId).toString();

  await db.prepare(`
    INSERT INTO do_ownership (do_id, owner_user_id)
    VALUES (?, ?)
  `).bind(doId, userId).run();

  await db.prepare(`
    INSERT INTO do_permissions (do_id, actor_id, actor_type, permission, granted_by_user_id)
    VALUES (?, ?, 'user', 'admin', ?)
  `).bind(doId, userId, userId).run();

  return instanceId;
}

/**
 * Handle POST /oauth/revoke
 * Revoke access or refresh token
 */
export async function handleOAuthRevoke(
  request: Request,
  db: D1Database
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  let body: { token: string; token_type_hint?: string };

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    body = {
      token: formData.get('token') as string,
      token_type_hint: formData.get('token_type_hint') as string | undefined
    };
  } else {
    body = await request.json() as { token: string; token_type_hint?: string };
  }

  if (!body.token) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: corsHeaders });
  }

  const tokenHash = await hashToken(body.token);

  // Try to revoke as refresh token first
  const refreshResult = await db.prepare(`
    UPDATE oauth_refresh_tokens SET revoked_at = unixepoch()
    WHERE token_hash = ? AND revoked_at IS NULL
  `).bind(tokenHash).run();

  if (refreshResult.meta.changes === 0) {
    // Try as access token - delete it
    await db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').bind(tokenHash).run();
  }

  // Always return 200 per RFC 7009
  return Response.json({}, { headers: corsHeaders });
}

/**
 * Verify OAuth access token
 * Returns user info if valid, null otherwise
 */
export async function verifyOAuthToken(
  token: string,
  db: D1Database
): Promise<{ userId: string; clientId: string; scopes: string[]; instanceId: string | null } | null> {
  const tokenHash = await hashToken(token);

  const tokenData = await db.prepare(`
    SELECT user_id, client_id, scopes, instance_id, expires_at
    FROM oauth_tokens
    WHERE token_hash = ?
  `).bind(tokenHash).first<{
        user_id: string;
        client_id: string;
        scopes: string;
        instance_id: string | null;
        expires_at: number;
    }>();

  if (!tokenData) {
    return null;
  }

  // Check expiry
  if (tokenData.expires_at < Math.floor(Date.now() / 1000)) {
    // Clean up expired token
    await db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }

  return {
    userId: tokenData.user_id,
    clientId: tokenData.client_id,
    scopes: JSON.parse(tokenData.scopes),
    instanceId: tokenData.instance_id
  };
}

/**
 * Handle GET /oauth/userinfo
 * Returns user profile information
 */
export async function handleOAuthUserInfo(
  request: Request,
  db: D1Database
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // Extract bearer token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'invalid_token' }, { status: 401, headers: corsHeaders });
  }

  const token = authHeader.slice(7);
  const tokenInfo = await verifyOAuthToken(token, db);

  if (!tokenInfo) {
    return Response.json({ error: 'invalid_token' }, { status: 401, headers: corsHeaders });
  }

  // Check scope
  if (!tokenInfo.scopes.includes('profile')) {
    return Response.json({ error: 'insufficient_scope' }, { status: 403, headers: corsHeaders });
  }

  // Get user info
  const user = await db.prepare(`
    SELECT id, email, name FROM users WHERE id = ?
  `).bind(tokenInfo.userId).first<{ id: string; email: string | null; name: string | null }>();

  if (!user) {
    return Response.json({ error: 'invalid_token' }, { status: 401, headers: corsHeaders });
  }

  const userInfo: OAuthUserInfo = {
    sub: user.id,
    email: user.email || undefined,
    name: user.name || undefined,
    instance_id: tokenInfo.instanceId || undefined
  };

  return Response.json(userInfo, { headers: corsHeaders });
}
