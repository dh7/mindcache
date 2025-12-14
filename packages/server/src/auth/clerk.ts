/**
 * Clerk JWT verification for Cloudflare Workers
 * Uses manual JWT verification with Clerk's PEM public key
 */

// Extended JsonWebKey with kid (key ID) property
interface JWKWithKid extends JsonWebKey {
  kid?: string;
}

interface ClerkJWTPayload {
  sub: string;      // User ID
  email?: string;
  name?: string;
  iat: number;
  exp: number;
  iss: string;
  azp?: string;     // Authorized party (your frontend URL)
}

interface AuthResult {
  valid: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export interface DelegateAuthResult extends AuthResult {
  delegateId?: string;
  parentUserId?: string;
  keyPermissions?: {
    can_read: boolean;
    can_write: boolean;
    can_system: boolean;
  };
}

// Cache for JWKS
let jwksCache: { keys: JWKWithKid[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 3600000; // 1 hour

/**
 * Fetch JWKS from Clerk
 */
async function getClerkJWKS(clerkSecretKey: string): Promise<JWKWithKid[]> {
  // Check cache
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  // Extract instance ID from secret key to build JWKS URL
  // Clerk JWKS URL format: https://<your-clerk-frontend-api>/.well-known/jwks.json
  // Or use the API: https://api.clerk.com/v1/jwks

  const response = await fetch('https://api.clerk.com/v1/jwks', {
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const data = await response.json() as { keys: JWKWithKid[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

/**
 * Import a JWK for verification
 */
async function importKey(jwk: JWKWithKid): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  const pad = str.length % 4;
  if (pad) {
    str += '='.repeat(4 - pad);
  }
  // Replace URL-safe chars
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a Clerk JWT token
 */
export async function verifyClerkJWT(
  token: string,
  clerkSecretKey: string
): Promise<AuthResult> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to get key ID
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { kid?: string; alg: string };

    // Decode payload
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as ClerkJWTPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // Check not before
    if (payload.iat && payload.iat > now + 60) { // 60 second clock skew allowance
      return { valid: false, error: 'Token not yet valid' };
    }

    // Get JWKS and find matching key
    let jwks = await getClerkJWKS(clerkSecretKey);
    let jwk = header.kid
      ? jwks.find(k => k.kid === header.kid)
      : jwks[0];

    // If no matching key found and we used cache, invalidate and retry
    if (!jwk && jwksCache) {
      jwksCache = null;
      jwks = await getClerkJWKS(clerkSecretKey);
      jwk = header.kid
        ? jwks.find(k => k.kid === header.kid)
        : jwks[0];
    }

    if (!jwk) {
      return { valid: false, error: 'No matching key found' };
    }

    // Import key and verify signature
    const key = await importKey(jwk);
    const signatureData = base64UrlDecode(signatureB64);
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signatureData,
      signedData
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    return {
      valid: true,
      userId: payload.sub,
      email: payload.email
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
        id: result.scope_id
      },
      permissions: JSON.parse(result.permissions)
    };
  } catch (error) {
    return { valid: false, error: `API key verification error: ${error}` };
  }
}

/**
 * Hash a secret for storage/comparison
 */
async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a secure random secret (32+ bytes)
 */
function generateSecureSecret(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map(v => chars[v % chars.length])
    .join('');
}

/**
 * Verify a delegate (API key) against the database
 */
export async function verifyDelegate(
  delegateId: string,
  delegateSecret: string,
  db: D1Database
): Promise<DelegateAuthResult> {
  try {
    // Hash the secret for comparison
    const secretHash = await hashSecret(delegateSecret);

    // Look up the delegate via delegate_secrets table
    const result = await db.prepare(`
      SELECT 
        d.delegate_id,
        d.created_by_user_id,
        d.can_read,
        d.can_write,
        d.can_system,
        d.expires_at,
        u.email
      FROM delegates d
      JOIN users u ON u.id = d.created_by_user_id
      WHERE d.delegate_id = ?
        AND EXISTS (
          SELECT 1 FROM delegate_secrets ds
          WHERE ds.delegate_id = d.delegate_id
            AND ds.secret_hash = ?
            AND ds.revoked_at IS NULL
        )
        AND (d.expires_at IS NULL OR d.expires_at > unixepoch())
    `).bind(delegateId, secretHash).first<{
      delegate_id: string;
      created_by_user_id: string;
      can_read: number;
      can_write: number;
      can_system: number;
      expires_at: number | null;
      email: string;
    }>();

    if (!result) {
      return { valid: false, error: 'Invalid delegate credentials' };
    }

    // Update last_used_at for the secret (if using new system)
    await db.prepare(`
      UPDATE delegate_secrets
      SET last_used_at = unixepoch()
      WHERE delegate_id = ? AND secret_hash = ? AND revoked_at IS NULL
    `).bind(delegateId, secretHash).run();

    // Check expiration
    if (result.expires_at && result.expires_at < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Delegate expired' };
    }

    return {
      valid: true,
      userId: result.created_by_user_id,
      email: result.email,
      delegateId: result.delegate_id,
      parentUserId: result.created_by_user_id,
      keyPermissions: {
        can_read: result.can_read === 1,
        can_write: result.can_write === 1,
        can_system: result.can_system === 1
      }
    };
  } catch (error) {
    return { valid: false, error: `Delegate verification error: ${error}` };
  }
}

/**
 * Extract auth from request headers
 */
export function extractAuth(request: Request):
  | { type: 'jwt' | 'api_key' | 'delegate'; token: string; parts?: string[] }
  | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Bearer token (Clerk JWT or legacy API key)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Check if it's a legacy API key (starts with mc_)
    if (token.startsWith('mc_')) {
      return { type: 'api_key', token };
    }
    return { type: 'jwt', token };
  }

  // ApiKey format: ApiKey delegateId:secret
  if (authHeader.startsWith('ApiKey ')) {
    const parts = authHeader.slice(7).split(':');
    if (parts.length === 2) {
      return { type: 'delegate', token: authHeader.slice(7), parts };
    }
  }

  return null;
}

// Export generateSecureSecret for use in delegate creation
export { generateSecureSecret, hashSecret };

