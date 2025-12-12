/**
 * MindCache API Worker
 *
 * Handles:
 * - Authentication (Clerk JWT + API keys)
 * - Routing to Durable Objects
 * - REST API endpoints
 */

import { MindCacheInstanceDO } from './durable-objects/MindCacheInstance';
import { extractAuth, verifyClerkJWT, verifyApiKey, verifyDelegate } from './auth/clerk';
import { handleClerkWebhook } from './webhooks/clerk';
import {
  checkDelegatePermission,
  checkUserPermission,
  grantDelegateAccess,
  revokeAccess
} from './auth/permissions';
import { generateSecureSecret, hashSecret } from './auth/clerk';
import {
  handleChatRequest,
  handleTransformRequest,
  handleGenerateImageRequest,
  handleAnalyzeImageRequest
} from './ai';

export { MindCacheInstanceDO };

// Hash a token for storage/lookup
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface Env {
  // Durable Objects
  MINDCACHE_INSTANCE: DurableObjectNamespace;

  // D1 Database
  DB: D1Database;

  // Environment
  ENVIRONMENT: string;

  // Clerk (set via wrangler secret)
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_WEBHOOK_SECRET?: string;

  // OpenAI (set via wrangler secret)
  OPENAI_API_KEY?: string;

  // Fireworks (set via wrangler secret) - for image generation
  FIREWORKS_API_KEY?: string;

  // Admin token for DO introspection
  ADMIN_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === '/health') {
        return Response.json({ status: 'ok', environment: env.ENVIRONMENT });
      }

      // Clerk webhook endpoint
      if (path === '/webhooks/clerk' && request.method === 'POST') {
        return handleClerkWebhook(request, env);
      }

      // WebSocket upgrade for real-time sync
      if (path.startsWith('/sync/')) {
        const instanceId = path.split('/')[2];
        if (!instanceId) {
          return Response.json({ error: 'Instance ID required' }, { status: 400 });
        }

        // Verify auth BEFORE upgrading WebSocket
        // Check for token in query string (from token exchange)
        const token = url.searchParams.get('token');

        // Dev mode bypass for WebSocket
        if (env.ENVIRONMENT === 'development' && !token && !extractAuth(request)) {
          const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
          const stub = env.MINDCACHE_INSTANCE.get(id);
          const headers = new Headers(request.headers);
          headers.set('X-MindCache-PreAuth', 'true');
          headers.set('X-MindCache-UserId', 'dev-user');
          headers.set('X-MindCache-Permission', 'write');
          const modifiedRequest = new Request(request.url, {
            method: request.method,
            headers,
            body: request.body
          });
          return stub.fetch(modifiedRequest);
        }

        if (token) {
          // Verify short-lived token
          const tokenData = await env.DB.prepare(`
            SELECT user_id, instance_id, permission, expires_at 
            FROM ws_tokens 
            WHERE token_hash = ?
          `).bind(await hashToken(token)).first<{
            user_id: string;
            instance_id: string;
            permission: string;
            expires_at: number;
          }>();

          if (!tokenData) {
            return Response.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders });
          }

          if (tokenData.expires_at < Math.floor(Date.now() / 1000)) {
            return Response.json({ error: 'Token expired' }, { status: 401, headers: corsHeaders });
          }

          if (tokenData.instance_id !== instanceId) {
            return Response.json({ error: 'Token not valid for this instance' }, { status: 403, headers: corsHeaders });
          }

          // Delete used token (one-time use)
          await env.DB.prepare('DELETE FROM ws_tokens WHERE token_hash = ?')
            .bind(await hashToken(token)).run();
        } else {
          // Fallback: Check API key in Authorization header (for server-to-server)
          const authData = extractAuth(request);
          if (!authData) {
            return Response.json({ error: 'Authorization required' }, { status: 401, headers: corsHeaders });
          }

          const auth = await verifyApiKey(authData.token, env.DB);
          if (!auth.valid) {
            return Response.json({ error: auth.error || 'Unauthorized' }, { status: 401, headers: corsHeaders });
          }
        }

        // Auth verified - forward to Durable Object with auth info
        const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
        const stub = env.MINDCACHE_INSTANCE.get(id);

        // Add header to indicate pre-auth (token auth was verified by Worker)
        const headers = new Headers(request.headers);
        headers.set('X-MindCache-PreAuth', 'true');
        headers.set('X-MindCache-UserId', token ? 'token-user' : 'api-key-user');
        headers.set('X-MindCache-Permission', 'write');

        const modifiedRequest = new Request(request.url, {
          method: request.method,
          headers,
          body: request.body
        });

        return stub.fetch(modifiedRequest);
      }

      // Admin: Get DO contents by hex ID (for introspection)
      if (path.startsWith('/admin/do/') && request.method === 'GET') {
        const objectId = path.split('/')[3];
        if (!objectId) {
          return Response.json({ error: 'Object ID required' }, { status: 400, headers: corsHeaders });
        }

        // Require admin API token
        const adminToken = request.headers.get('X-Admin-Token');
        if (adminToken !== env.ADMIN_TOKEN) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        try {
          const id = env.MINDCACHE_INSTANCE.idFromString(objectId);
          const stub = env.MINDCACHE_INSTANCE.get(id);
          const res = await stub.fetch(new Request('http://do/keys'));
          const keys = await res.json();
          return Response.json({ keys }, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ error: 'Failed to fetch DO', details: String(e) }, { status: 500, headers: corsHeaders });
        }
      }

      // REST API routes
      if (path.startsWith('/api/')) {
        return handleApiRequest(request, env, path);
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Worker error:', error);
      return Response.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHeaders }
      );
    }
  }
};

async function handleApiRequest(request: Request, env: Env, path: string): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  try {
    // Authenticate request
    const authData = extractAuth(request);

    let userId: string;
    let actorType: 'user' | 'delegate' = 'user';
    let delegateId: string | undefined;

    // Dev mode bypass - allow unauthenticated access in development
    if (env.ENVIRONMENT === 'development' && !authData) {
      userId = 'dev-user';
    } else if (!authData) {
      return Response.json({ error: 'Authorization required' }, { status: 401, headers: corsHeaders });
    } else {
      let auth;
      if (authData.type === 'jwt') {
        if (!env.CLERK_SECRET_KEY) {
          // In dev mode without Clerk, use dev user
          if (env.ENVIRONMENT === 'development') {
            userId = 'dev-user';
          } else {
            return Response.json({ error: 'Auth not configured' }, { status: 500, headers: corsHeaders });
          }
        } else {
          try {
            auth = await verifyClerkJWT(authData.token, env.CLERK_SECRET_KEY);
          } catch (e) {
            console.error('JWT verification error:', e);
            return Response.json({ error: 'JWT verification failed' }, { status: 401, headers: corsHeaders });
          }
          if (!auth.valid) {
            return Response.json({ error: auth.error || 'Unauthorized' }, { status: 401, headers: corsHeaders });
          }
          userId = auth.userId!;
        }
      } else if (authData.type === 'delegate') {
        // Delegate authentication: ApiKey delegateId:secret
        if (!authData.parts || authData.parts.length !== 2) {
          return Response.json({ error: 'Invalid delegate format' }, { status: 401, headers: corsHeaders });
        }
        const [delId, secret] = authData.parts;
        auth = await verifyDelegate(delId, secret, env.DB);
        if (!auth.valid) {
          return Response.json({ error: auth.error || 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        userId = auth.parentUserId!;
        actorType = 'delegate';
        delegateId = delId;
      } else {
        // Legacy API key
        auth = await verifyApiKey(authData.token, env.DB);
        if (!auth.valid) {
          return Response.json({ error: auth.error || 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        userId = auth.userId!;
      }
      userId = userId || 'dev-user';
    }

    // Ensure user exists in database (upsert on first login)
    // INSERT OR IGNORE handles conflicts on any unique constraint (id or clerk_id)
    await env.DB.prepare(`
    INSERT OR IGNORE INTO users (id, clerk_id, email, name)
    VALUES (?, ?, ?, ?)
  `).bind(userId, userId, null, null).run();

    // ============= WS TOKEN =============

    // Generate short-lived token for WebSocket connection
    if (path === '/api/ws-token' && request.method === 'POST') {
      let body: { instanceId: string; permission?: 'read' | 'write' };
      try {
        body = await request.json() as { instanceId: string; permission?: 'read' | 'write' };
      } catch (e) {
        return Response.json({ error: 'Invalid JSON body', details: String(e) }, { status: 400, headers: corsHeaders });
      }

      if (!body.instanceId) {
        return Response.json({ error: 'instanceId required' }, { status: 400, headers: corsHeaders });
      }

      // Verify user/delegate has access to this instance using new permission system
      const doId = env.MINDCACHE_INSTANCE.idFromName(body.instanceId).toString();

      let hasAccess = false;
      let permission: 'read' | 'write' | 'system' = 'read';

      if (actorType === 'delegate' && delegateId) {
        // Check delegate permissions (two-layer)
        hasAccess = await checkDelegatePermission(delegateId, doId, 'read', env.DB);
        if (hasAccess) {
          // Determine max permission level
          if (await checkDelegatePermission(delegateId, doId, 'system', env.DB)) {
            permission = 'system';
          } else if (await checkDelegatePermission(delegateId, doId, 'write', env.DB)) {
            permission = 'write';
          }
        }
      } else {
        // Check user permissions
        hasAccess = await checkUserPermission(userId, doId, 'read', env.DB);
        if (hasAccess) {
          // Determine max permission level
          if (await checkUserPermission(userId, doId, 'system', env.DB)) {
            permission = 'system';
          } else if (await checkUserPermission(userId, doId, 'write', env.DB)) {
            permission = 'write';
          }
        }
      }

      if (!hasAccess) {
        return Response.json({
          error: 'Instance not found or access denied',
          debug: { userId, actorType, instanceId: body.instanceId }
        }, { status: 403, headers: corsHeaders });
      }

      // Generate token
      const token = crypto.randomUUID() + crypto.randomUUID();
      const tokenHash = await hashToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + 60; // 60 seconds
      const requestedPermission = body.permission || permission;

      await env.DB.prepare(`
      INSERT INTO ws_tokens (token_hash, user_id, instance_id, permission, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(tokenHash, userId, body.instanceId, requestedPermission, expiresAt).run();

      return Response.json({
        token,
        expiresAt,
        instanceId: body.instanceId,
        permission: requestedPermission
      }, { headers: corsHeaders });
    }

    // ============= AI APIs =============

    // Chat API - AI chat with MindCache tools
    if (path === '/api/chat' && request.method === 'POST') {
      return handleChatRequest(request, env);
    }

    // Transform API - LLM text transformation
    if (path === '/api/transform' && request.method === 'POST') {
      return handleTransformRequest(request, env);
    }

    // Generate Image API - DALL-E image generation
    if (path === '/api/generate-image' && request.method === 'POST') {
      return handleGenerateImageRequest(request, env);
    }

    // Analyze Image API - GPT-4 Vision
    if (path === '/api/analyze-image' && request.method === 'POST') {
      return handleAnalyzeImageRequest(request, env);
    }

    // ============= PROJECTS =============

    // List projects (owned + shared)
    if (path === '/api/projects' && request.method === 'GET') {
      const { results } = await env.DB.prepare(`
      SELECT DISTINCT p.id, p.name, p.description, p.created_at, p.updated_at,
             CASE WHEN p.owner_id = ? THEN 'owner' ELSE s.permission END as role
      FROM projects p
      LEFT JOIN shares s ON s.resource_type = 'project' AND s.resource_id = p.id 
                        AND (s.target_type = 'user' AND s.target_id = ? OR s.target_type = 'public')
      WHERE p.owner_id = ? OR s.id IS NOT NULL
      ORDER BY p.updated_at DESC
    `).bind(userId, userId, userId).all();
      return Response.json({ projects: results }, { headers: corsHeaders });
    }

    // Create project
    if (path === '/api/projects' && request.method === 'POST') {
      const body = await request.json() as { name: string; description?: string };
      if (!body.name) {
        return Response.json({ error: 'Name required' }, { status: 400, headers: corsHeaders });
      }
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
      INSERT INTO projects (id, owner_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, body.name, body.description || null, now, now).run();

      // Create default instance
      const instanceId = crypto.randomUUID();
      await env.DB.prepare(`
      INSERT INTO instances (id, project_id, owner_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(instanceId, id, userId, 'main', now, now).run();

      // Create DO ownership and grant creator system permission
      const doId = env.MINDCACHE_INSTANCE.idFromName(instanceId).toString();
      await env.DB.prepare(`
        INSERT INTO do_ownership (do_id, owner_user_id)
        VALUES (?, ?)
      `).bind(doId, userId).run();

      await env.DB.prepare(`
        INSERT INTO do_permissions 
        (do_id, actor_id, actor_type, permission, granted_by_user_id)
        VALUES (?, ?, 'user', 'system', ?)
      `).bind(doId, userId, userId).run();

      return Response.json({
        id,
        name: body.name,
        description: body.description,
        defaultInstanceId: instanceId,
        created_at: now,
        updated_at: now
      }, { status: 201, headers: corsHeaders });
    }

    // Get single project (owned or shared)
    const projectMatch = path.match(/^\/api\/projects\/([\w-]+)$/);
    if (projectMatch && request.method === 'GET') {
      const projectId = projectMatch[1];
      const project = await env.DB.prepare(`
      SELECT DISTINCT p.id, p.name, p.description, p.created_at, p.updated_at,
             CASE WHEN p.owner_id = ? THEN 'owner' ELSE s.permission END as role
      FROM projects p
      LEFT JOIN shares s ON s.resource_type = 'project' AND s.resource_id = p.id 
                        AND (s.target_type = 'user' AND s.target_id = ? OR s.target_type = 'public')
      WHERE p.id = ? AND (p.owner_id = ? OR s.id IS NOT NULL)
    `).bind(userId, userId, projectId, userId).first();
      if (!project) {
        return Response.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(project, { headers: corsHeaders });
    }

    // Update project
    if (projectMatch && request.method === 'PUT') {
      const projectId = projectMatch[1];
      const body = await request.json() as { name?: string; description?: string };
      const result = await env.DB.prepare(`
      UPDATE projects SET 
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        updated_at = unixepoch()
      WHERE id = ? AND owner_id = ?
    `).bind(body.name || null, body.description || null, projectId, userId).run();
      if (!result.meta.changes) {
        return Response.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Delete project
    if (projectMatch && request.method === 'DELETE') {
      const projectId = projectMatch[1];
      await env.DB.prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?')
        .bind(projectId, userId).run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ============= INSTANCES =============

    // List instances for a project (if user has access)
    const instancesMatch = path.match(/^\/api\/projects\/([\w-]+)\/instances$/);
    if (instancesMatch && request.method === 'GET') {
      const projectId = instancesMatch[1];
      // Check user has access to project
      const hasAccess = await env.DB.prepare(`
      SELECT 1 FROM projects p
      LEFT JOIN shares s ON s.resource_type = 'project' AND s.resource_id = p.id 
                        AND (s.target_type = 'user' AND s.target_id = ? OR s.target_type = 'public')
      WHERE p.id = ? AND (p.owner_id = ? OR s.id IS NOT NULL)
    `).bind(userId, projectId, userId).first();

      if (!hasAccess) {
        return Response.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
      SELECT i.id, i.name, i.is_readonly, i.created_at, i.updated_at
      FROM instances i
      WHERE i.project_id = ?
      ORDER BY i.created_at DESC
    `).bind(projectId).all();
      return Response.json({ instances: results }, { headers: corsHeaders });
    }

    // Create instance
    if (instancesMatch && request.method === 'POST') {
      const projectId = instancesMatch[1];
      const body = await request.json() as { name: string; cloneFrom?: string };
      if (!body.name) {
        return Response.json({ error: 'Name required' }, { status: 400, headers: corsHeaders });
      }

      // Verify project ownership
      const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?')
        .bind(projectId, userId).first();
      if (!project) {
        return Response.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });
      }

      const id = crypto.randomUUID();
      await env.DB.prepare(`
      INSERT INTO instances (id, project_id, owner_id, name, parent_instance_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, projectId, userId, body.name, body.cloneFrom || null).run();

      // Create DO ownership and grant creator system permission
      const doId = env.MINDCACHE_INSTANCE.idFromName(id).toString();
      await env.DB.prepare(`
        INSERT INTO do_ownership (do_id, owner_user_id)
        VALUES (?, ?)
      `).bind(doId, userId).run();

      await env.DB.prepare(`
        INSERT INTO do_permissions 
        (do_id, actor_id, actor_type, permission, granted_by_user_id)
        VALUES (?, ?, 'user', 'system', ?)
      `).bind(doId, userId, userId).run();

      return Response.json({ id, name: body.name }, { status: 201, headers: corsHeaders });
    }

    // Get single instance (owned or shared via project/instance)
    const instanceMatch = path.match(/^\/api\/instances\/([\w-]+)$/);
    if (instanceMatch && request.method === 'GET') {
      const instanceId = instanceMatch[1];
      const instance = await env.DB.prepare(`
      SELECT DISTINCT i.id, i.project_id, i.name, i.is_readonly, i.created_at, i.updated_at,
             CASE 
               WHEN p.owner_id = ? THEN 'owner'
               WHEN si.permission IS NOT NULL THEN si.permission
               ELSE sp.permission 
             END as role
      FROM instances i
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN shares sp ON sp.resource_type = 'project' AND sp.resource_id = p.id 
                         AND (sp.target_type = 'user' AND sp.target_id = ? OR sp.target_type = 'public')
      LEFT JOIN shares si ON si.resource_type = 'instance' AND si.resource_id = i.id 
                         AND (si.target_type = 'user' AND si.target_id = ? OR si.target_type = 'public')
      WHERE i.id = ? AND (p.owner_id = ? OR sp.id IS NOT NULL OR si.id IS NOT NULL)
    `).bind(userId, userId, userId, instanceId, userId).first();
      if (!instance) {
        return Response.json({ error: 'Instance not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(instance, { headers: corsHeaders });
    }

    // Delete instance
    if (instanceMatch && request.method === 'DELETE') {
      const instanceId = instanceMatch[1];

      // Delete DO storage first
      try {
        const doId = env.MINDCACHE_INSTANCE.idFromName(instanceId);
        const stub = env.MINDCACHE_INSTANCE.get(doId);
        await stub.fetch(new Request('http://do/destroy', { method: 'DELETE' }));
      } catch (e) {
        console.error('Failed to destroy DO:', e);
      // Continue with DB deletion even if DO cleanup fails
      }

      // Delete DB record
      await env.DB.prepare(`
      DELETE FROM instances WHERE id = ? AND owner_id = ?
    `).bind(instanceId, userId).run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Update instance (rename)
    if (instanceMatch && request.method === 'PATCH') {
      const instanceId = instanceMatch[1];
      const body = await request.json() as { name?: string };
      if (!body.name?.trim()) {
        return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
      }
      await env.DB.prepare(`
      UPDATE instances SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ?
    `).bind(body.name.trim(), instanceId, userId).run();
      const updated = await env.DB.prepare(`
      SELECT id, name, is_readonly, created_at, updated_at FROM instances WHERE id = ?
    `).bind(instanceId).first();
      return Response.json(updated, { headers: corsHeaders });
    }

    // ============= SHARES =============

    // List shares for a resource
    const sharesMatch = path.match(/^\/api\/(projects|instances)\/([\w-]+)\/shares$/);
    if (sharesMatch && request.method === 'GET') {
      const [, resourceType, resourceId] = sharesMatch;
      const { results } = await env.DB.prepare(`
      SELECT s.id, s.target_type, s.target_id, s.permission, s.created_at,
             u.email as target_email, u.name as target_name
      FROM shares s
      LEFT JOIN users u ON s.target_type = 'user' AND s.target_id = u.id
      WHERE s.resource_type = ? AND s.resource_id = ?
    `).bind(resourceType === 'projects' ? 'project' : 'instance', resourceId).all();
      return Response.json({ shares: results }, { headers: corsHeaders });
    }

    // Create share
    if (sharesMatch && request.method === 'POST') {
      const [, resourceType, resourceId] = sharesMatch;
      const body = await request.json() as {
      targetType: 'user' | 'public';
      targetId?: string;
      targetEmail?: string;
      permission: 'read' | 'write' | 'admin'
    };

      // If sharing by email, look up user
      let targetId = body.targetId;
      if (body.targetType === 'user' && body.targetEmail && !targetId) {
        const user = await env.DB.prepare(`
        SELECT id FROM users WHERE email = ?
      `).bind(body.targetEmail).first<{ id: string }>();
        if (!user) {
          return Response.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });
        }
        targetId = user.id;
      }

      const id = crypto.randomUUID();
      await env.DB.prepare(`
      INSERT INTO shares (id, resource_type, resource_id, target_type, target_id, permission)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
        id,
        resourceType === 'projects' ? 'project' : 'instance',
        resourceId,
        body.targetType,
        body.targetType === 'public' ? null : targetId,
        body.permission
      ).run();

      return Response.json({ id, ...body }, { status: 201, headers: corsHeaders });
    }

    // Delete share
    const shareDeleteMatch = path.match(/^\/api\/shares\/([\w-]+)$/);
    if (shareDeleteMatch && request.method === 'DELETE') {
      const shareId = shareDeleteMatch[1];
      await env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(shareId).run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ============= API KEYS =============

    // List API keys
    if (path === '/api/keys' && request.method === 'GET') {
      const { results } = await env.DB.prepare(`
      SELECT id, name, key_prefix, scope_type, scope_id, permissions, created_at, last_used_at
      FROM api_keys WHERE user_id = ?
      ORDER BY created_at DESC
    `).bind(userId).all();
      return Response.json({ keys: results }, { headers: corsHeaders });
    }

    // Create API key
    if (path === '/api/keys' && request.method === 'POST') {
      const body = await request.json() as {
      name: string;
      scopeType: 'account' | 'project' | 'instance';
      scopeId?: string;
      permissions: string[];
    };

      // Generate API key: mc_live_<random>
      const keyRandom = crypto.randomUUID().replace(/-/g, '');
      const apiKey = `mc_live_${keyRandom}`;
      const keyPrefix = apiKey.substring(0, 12);

      // Hash the key for storage
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const id = crypto.randomUUID();
      await env.DB.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scope_type, scope_id, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        id, userId, body.name, keyHash, keyPrefix,
        body.scopeType, body.scopeId || null, JSON.stringify(body.permissions)
      ).run();

      // Return the full key only once (won't be retrievable later)
      return Response.json({
        id,
        name: body.name,
        key: apiKey,
        keyPrefix,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        permissions: body.permissions
      }, { status: 201, headers: corsHeaders });
    }

    // Delete API key
    const keyDeleteMatch = path.match(/^\/api\/keys\/([\w-]+)$/);
    if (keyDeleteMatch && request.method === 'DELETE') {
      const keyId = keyDeleteMatch[1];
      await env.DB.prepare(`
      DELETE FROM api_keys WHERE id = ? AND user_id = ?
    `).bind(keyId, userId).run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ============= DELEGATES =============

    // List delegates (only users can list their own delegates)
    if (path === '/api/delegates' && request.method === 'GET') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot list delegates' }, { status: 403, headers: corsHeaders });
      }
      const { results } = await env.DB.prepare(`
        SELECT delegate_id, name, can_read, can_write, can_system, created_at, expires_at
        FROM delegates WHERE created_by_user_id = ?
        ORDER BY created_at DESC
      `).bind(userId).all();
      return Response.json({ delegates: results }, { headers: corsHeaders });
    }

    // Create delegate (only users can create delegates)
    if (path === '/api/delegates' && request.method === 'POST') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot create delegates' }, { status: 403, headers: corsHeaders });
      }
      const body = await request.json() as {
        name: string;
        keyPermissions: {
          can_read: boolean;
          can_write: boolean;
          can_system: boolean;
        };
        expiresAt?: string;
      };

      if (!body.name?.trim()) {
        return Response.json({ error: 'Name required' }, { status: 400, headers: corsHeaders });
      }

      try {
        const delegateId = `del_${crypto.randomUUID().replace(/-/g, '')}`;

        let expiresAt: number | null = null;
        if (body.expiresAt) {
          const date = new Date(body.expiresAt);
          if (isNaN(date.getTime())) {
            return Response.json({ error: 'Invalid expiration date format' }, { status: 400, headers: corsHeaders });
          }
          expiresAt = Math.floor(date.getTime() / 1000);
        }

        // Create delegate (no secret yet - secrets are created separately)
        await env.DB.prepare(`
          INSERT INTO delegates 
          (delegate_id, created_by_user_id, name,
           can_read, can_write, can_system, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          delegateId, userId, body.name.trim(),
          body.keyPermissions.can_read ? 1 : 0,
          body.keyPermissions.can_write ? 1 : 0,
          body.keyPermissions.can_system ? 1 : 0,
          expiresAt
        ).run();

        // Return delegate (no secret - user must create one separately)
        return Response.json({
          delegate_id: delegateId,
          name: body.name,
          keyPermissions: body.keyPermissions,
          expiresAt: body.expiresAt || null,
          can_read: body.keyPermissions.can_read,
          can_write: body.keyPermissions.can_write,
          can_system: body.keyPermissions.can_system,
          created_at: Math.floor(Date.now() / 1000)
        }, { status: 201, headers: corsHeaders });
      } catch (dbError) {
        console.error('Database error creating delegate:', dbError);
        console.error('Error type:', typeof dbError);
        console.error('Error keys:', dbError instanceof Error ? Object.keys(dbError) : 'not an Error');
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        const errorStack = dbError instanceof Error ? dbError.stack : undefined;
        console.error('Error message:', errorMessage);
        console.error('Error stack:', errorStack);

        // Check if table doesn't exist
        if (errorMessage.includes('no such table')) {
          return Response.json(
            { error: 'Database migration not applied. Please run: pnpm db:migrate:local' },
            { status: 500, headers: corsHeaders }
          );
        }

        // Check if column doesn't exist (migration not applied)
        if (errorMessage.includes('no such column')) {
          return Response.json(
            { error: 'Database schema outdated. Please run: pnpm db:migrate:local', details: errorMessage },
            { status: 500, headers: corsHeaders }
          );
        }

        return Response.json(
          { error: 'Failed to create delegate', details: errorMessage, stack: errorStack },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Create a new secret for a delegate
    const delegateSecretCreateMatch = path.match(/^\/api\/delegates\/([\w-]+)\/secrets$/);
    if (delegateSecretCreateMatch && request.method === 'POST') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot create secrets' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateSecretCreateMatch[1];

      // Verify delegate belongs to user
      const delegate = await env.DB.prepare(`
        SELECT delegate_id FROM delegates WHERE delegate_id = ? AND created_by_user_id = ?
      `).bind(delId, userId).first();

      if (!delegate) {
        return Response.json({ error: 'Delegate not found' }, { status: 404, headers: corsHeaders });
      }

      const body = await request.json() as { name?: string };

      try {
        const secretId = `sec_${crypto.randomUUID().replace(/-/g, '')}`;
        const delegateSecret = `sec_${generateSecureSecret(32)}`;
        const secretHash = await hashSecret(delegateSecret);

        // Create secret in delegate_secrets table
        await env.DB.prepare(`
          INSERT INTO delegate_secrets 
          (secret_id, delegate_id, secret_hash, name, created_by_user_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(secretId, delId, secretHash, body.name?.trim() || null, userId).run();

        // Return secret ONCE - never stored/shown again
        return Response.json({
          secret_id: secretId,
          delegate_id: delId,
          delegateSecret, // ⚠️ Only shown once - copy it now!
          name: body.name || null,
          warning: 'This secret will never be displayed again. Copy it now.'
        }, { status: 201, headers: corsHeaders });
      } catch (dbError) {
        console.error('Database error creating secret:', dbError);
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        console.error('Error details:', errorMessage);

        // Check if table doesn't exist
        if (errorMessage.includes('no such table') || errorMessage.includes('delegate_secrets')) {
          return Response.json(
            { error: 'Database migration not applied. Please run: pnpm db:migrate:local', details: errorMessage },
            { status: 500, headers: corsHeaders }
          );
        }

        // Check if column doesn't exist
        if (errorMessage.includes('no such column')) {
          return Response.json(
            { error: 'Database schema outdated. Please run: pnpm db:migrate:local', details: errorMessage },
            { status: 500, headers: corsHeaders }
          );
        }

        return Response.json(
          { error: 'Failed to create secret', details: errorMessage },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // List secrets for a delegate
    if (delegateSecretCreateMatch && request.method === 'GET') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot list secrets' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateSecretCreateMatch[1];

      // Verify delegate belongs to user
      const delegate = await env.DB.prepare(`
        SELECT delegate_id FROM delegates WHERE delegate_id = ? AND created_by_user_id = ?
      `).bind(delId, userId).first();

      if (!delegate) {
        return Response.json({ error: 'Delegate not found' }, { status: 404, headers: corsHeaders });
      }

      const secrets = await env.DB.prepare(`
        SELECT secret_id, name, created_at, last_used_at, revoked_at
        FROM delegate_secrets
        WHERE delegate_id = ?
        ORDER BY created_at DESC
      `).bind(delId).all();

      return Response.json({ secrets: secrets.results }, { headers: corsHeaders });
    }

    // Revoke a secret
    const delegateSecretRevokeMatch = path.match(/^\/api\/delegates\/([\w-]+)\/secrets\/([\w-]+)$/);
    if (delegateSecretRevokeMatch && request.method === 'DELETE') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot revoke secrets' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateSecretRevokeMatch[1];
      const secretId = delegateSecretRevokeMatch[2];

      // Verify delegate belongs to user and secret belongs to delegate
      const secret = await env.DB.prepare(`
        SELECT ds.secret_id
        FROM delegate_secrets ds
        JOIN delegates d ON d.delegate_id = ds.delegate_id
        WHERE ds.secret_id = ? AND ds.delegate_id = ? AND d.created_by_user_id = ?
      `).bind(secretId, delId, userId).first();

      if (!secret) {
        return Response.json({ error: 'Secret not found' }, { status: 404, headers: corsHeaders });
      }

      // Revoke the secret (set revoked_at timestamp)
      await env.DB.prepare(`
        UPDATE delegate_secrets
        SET revoked_at = unixepoch()
        WHERE secret_id = ?
      `).bind(secretId).run();

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Delete delegate
    const delegateDeleteMatch = path.match(/^\/api\/delegates\/([\w-]+)$/);
    if (delegateDeleteMatch && request.method === 'DELETE') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot delete delegates' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateDeleteMatch[1];
      await env.DB.prepare(`
        DELETE FROM delegates WHERE delegate_id = ? AND created_by_user_id = ?
      `).bind(delId, userId).run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Grant delegate access to instance
    const delegateGrantMatch = path.match(/^\/api\/delegates\/([\w-]+)\/grants$/);
    if (delegateGrantMatch && request.method === 'POST') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot grant access' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateGrantMatch[1];
      const body = await request.json() as {
        instanceId: string;
        permission: 'read' | 'write' | 'system';
      };

      if (!body.instanceId || !body.permission) {
        return Response.json({ error: 'instanceId and permission required' }, { status: 400, headers: corsHeaders });
      }

      // Map instanceId to DO ID
      const doId = env.MINDCACHE_INSTANCE.idFromName(body.instanceId).toString();

      // Check if user owns the instance (for legacy instances without do_ownership)
      const instance = await env.DB.prepare(`
        SELECT owner_id FROM instances WHERE id = ?
      `).bind(body.instanceId).first<{ owner_id: string }>();

      if (!instance) {
        return Response.json({ error: 'Instance not found' }, { status: 404, headers: corsHeaders });
      }

      // If user owns instance but DO ownership doesn't exist, create it
      if (instance.owner_id === userId) {
        // Ensure DO ownership exists (for legacy instances)
        await env.DB.prepare(`
          INSERT OR IGNORE INTO do_ownership (do_id, owner_user_id)
          VALUES (?, ?)
        `).bind(doId, userId).run();

        // Ensure user has system permission (for legacy instances)
        await env.DB.prepare(`
          INSERT OR IGNORE INTO do_permissions 
          (do_id, actor_id, actor_type, permission, granted_by_user_id)
          VALUES (?, ?, 'user', 'system', ?)
        `).bind(doId, userId, userId).run();
      }

      try {
        await grantDelegateAccess(userId, delId, doId, body.permission, env.DB);
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Failed to grant access' },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // Revoke delegate access
    const delegateRevokeMatch = path.match(/^\/api\/delegates\/([\w-]+)\/grants\/([\w-]+)$/);
    if (delegateRevokeMatch && request.method === 'DELETE') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot revoke access' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateRevokeMatch[1];
      const instanceId = delegateRevokeMatch[2];

      // Map instanceId to DO ID
      const doId = env.MINDCACHE_INSTANCE.idFromName(instanceId).toString();

      try {
        await revokeAccess(userId, delId, 'delegate', doId, env.DB);
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Failed to revoke access' },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // List grants for a delegate
    const delegateGrantsMatch = path.match(/^\/api\/delegates\/([\w-]+)\/grants$/);
    if (delegateGrantsMatch && request.method === 'GET') {
      if (actorType === 'delegate') {
        return Response.json({ error: 'Delegates cannot list grants' }, { status: 403, headers: corsHeaders });
      }
      const delId = delegateGrantsMatch[1];

      // Verify delegate belongs to user
      const delegate = await env.DB.prepare(`
        SELECT delegate_id FROM delegates WHERE delegate_id = ? AND created_by_user_id = ?
      `).bind(delId, userId).first();

      if (!delegate) {
        return Response.json({ error: 'Delegate not found' }, { status: 404, headers: corsHeaders });
      }

      const { results } = await env.DB.prepare(`
        SELECT do_id, permission, granted_at, expires_at
        FROM do_permissions
        WHERE actor_id = ? AND actor_type = 'delegate'
        ORDER BY granted_at DESC
      `).bind(delId).all<{
        do_id: string;
        permission: string;
        granted_at: number;
        expires_at: number | null;
      }>();

      // Map do_id back to instance_id by checking all instances
      const grantsWithInstanceId = [];
      const allInstances = await env.DB.prepare(`
        SELECT id FROM instances
      `).all<{ id: string }>();

      for (const grant of results) {
        // Find instance_id that maps to this do_id
        let instanceId: string | null = null;
        for (const instance of allInstances.results || []) {
          const computedDoId = env.MINDCACHE_INSTANCE.idFromName(instance.id).toString();
          if (computedDoId === grant.do_id) {
            instanceId = instance.id;
            break;
          }
        }
        grantsWithInstanceId.push({
          ...grant,
          instance_id: instanceId || grant.do_id // Fallback to do_id if not found
        });
      }

      return Response.json({ grants: grantsWithInstanceId }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('API error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: 'Internal server error', details, stack: error instanceof Error ? error.stack : undefined },
      { status: 500, headers: corsHeaders }
    );
  }
}

