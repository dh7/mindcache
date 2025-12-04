/**
 * MindCache API Worker
 * 
 * Handles:
 * - Authentication (Clerk JWT + API keys)
 * - Routing to Durable Objects
 * - REST API endpoints
 */

import { MindCacheInstanceDO } from './durable-objects/MindCacheInstance';
import { extractAuth, verifyClerkJWT, verifyApiKey } from './auth/clerk';
import { handleClerkWebhook } from './webhooks/clerk';
import { 
  handleChatRequest, 
  handleTransformRequest, 
  handleGenerateImageRequest, 
  handleAnalyzeImageRequest 
} from './ai';

export { MindCacheInstanceDO };

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
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

        // Get or create the Durable Object for this instance
        const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
        const stub = env.MINDCACHE_INSTANCE.get(id);
        
        // Forward the request to the Durable Object
        return stub.fetch(request);
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
  },
};

async function handleApiRequest(request: Request, env: Env, path: string): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  try {
    // Authenticate request
    const authData = extractAuth(request);
    
    let userId: string;
    
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
      } else {
        auth = await verifyApiKey(authData.token, env.DB);
        if (!auth.valid) {
          return Response.json({ error: auth.error || 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        userId = auth.userId!;
      }
      userId = userId || 'dev-user';
    }

  // Ensure user exists in database (upsert on first login)
  await env.DB.prepare(`
    INSERT OR IGNORE INTO users (id, clerk_id, email, name)
    VALUES (?, ?, ?, ?)
  `).bind(userId, userId, null, null).run();

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
    await env.DB.prepare(`DELETE FROM projects WHERE id = ? AND owner_id = ?`)
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
    const project = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND owner_id = ?`)
      .bind(projectId, userId).first();
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });
    }
    
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO instances (id, project_id, owner_id, name, parent_instance_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, projectId, userId, body.name, body.cloneFrom || null).run();
    
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
    await env.DB.prepare(`
      DELETE FROM instances WHERE id = ? AND owner_id = ?
    `).bind(instanceId, userId).run();
    return Response.json({ success: true }, { headers: corsHeaders });
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
    await env.DB.prepare(`DELETE FROM shares WHERE id = ?`).bind(shareId).run();
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

  return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('API error:', error);
    return Response.json(
      { error: 'Internal server error', details: String(error) }, 
      { status: 500, headers: corsHeaders }
    );
  }
}

