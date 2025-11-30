/**
 * Clerk JWT verification for Cloudflare Workers
 */

interface ClerkJWTPayload {
  sub: string;      // User ID
  email?: string;
  name?: string;
  iat: number;
  exp: number;
  iss: string;
}

interface AuthResult {
  valid: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

/**
 * Verify a Clerk JWT token
 * Uses Clerk's JWKS endpoint to verify the signature
 */
export async function verifyClerkJWT(
  token: string,
  clerkSecretKey: string
): Promise<AuthResult> {
  try {
    // Decode the JWT without verification first to get the header
    const [headerB64, payloadB64] = token.split('.');
    if (!headerB64 || !payloadB64) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Decode payload
    const payload = JSON.parse(atob(payloadB64)) as ClerkJWTPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // For development, we'll do a simple verification
    // In production, you should verify against Clerk's JWKS
    // https://clerk.com/docs/backend-requests/handling/manual-jwt-verification
    
    // Verify with Clerk's Backend API
    const response = await fetch('https://api.clerk.com/v1/tokens/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return { valid: false, error: 'Token verification failed' };
    }

    return {
      valid: true,
      userId: payload.sub,
      email: payload.email,
    };
  } catch (error) {
    return { valid: false, error: `Verification error: ${error}` };
  }
}

/**
 * Verify an API key against the database
 */
export async function verifyApiKey(
  apiKey: string,
  db: D1Database
): Promise<AuthResult & { scope?: { type: string; id: string | null }; permissions?: string[] }> {
  try {
    // API key format: mc_live_XXXX or mc_test_XXXX
    const prefix = apiKey.substring(0, 12); // e.g., "mc_live_abc1"
    
    // Hash the full key for comparison
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Look up the key
    const result = await db.prepare(`
      SELECT 
        ak.id,
        ak.user_id,
        ak.scope_type,
        ak.scope_id,
        ak.permissions,
        u.email
      FROM api_keys ak
      JOIN users u ON u.id = ak.user_id
      WHERE ak.key_hash = ? AND ak.key_prefix = ?
    `).bind(keyHash, prefix).first<{
      id: string;
      user_id: string;
      scope_type: string;
      scope_id: string | null;
      permissions: string;
      email: string;
    }>();

    if (!result) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Update last_used_at
    await db.prepare(`
      UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?
    `).bind(result.id).run();

    return {
      valid: true,
      userId: result.user_id,
      email: result.email,
      scope: {
        type: result.scope_type,
        id: result.scope_id,
      },
      permissions: JSON.parse(result.permissions),
    };
  } catch (error) {
    return { valid: false, error: `API key verification error: ${error}` };
  }
}

/**
 * Extract auth from request headers
 */
export function extractAuth(request: Request): { type: 'jwt' | 'api_key'; token: string } | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return null;
  }

  // Bearer token (Clerk JWT)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Check if it's an API key (starts with mc_)
    if (token.startsWith('mc_')) {
      return { type: 'api_key', token };
    }
    return { type: 'jwt', token };
  }

  return null;
}

