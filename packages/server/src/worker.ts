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
    'Content-Type': 'application/json',
  };

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
        auth = await verifyClerkJWT(authData.token, env.CLERK_SECRET_KEY);
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

  // Ensure dev user exists in dev mode
  if (env.ENVIRONMENT === 'development' && userId === 'dev-user') {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO users (id, clerk_id, email, name)
      VALUES ('dev-user', 'dev-user', 'dev@localhost', 'Dev User')
    `).run();
  }

  // ============= PROJECTS =============
  
  // List projects
  if (path === '/api/projects' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT id, name, description, created_at, updated_at
      FROM projects WHERE owner_id = ?
      ORDER BY updated_at DESC
    `).bind(userId).all();
    return Response.json({ projects: results }, { headers: corsHeaders });
  }

  // Create project
  if (path === '/api/projects' && request.method === 'POST') {
    const body = await request.json() as { name: string; description?: string };
    if (!body.name) {
      return Response.json({ error: 'Name required' }, { status: 400, headers: corsHeaders });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO projects (id, owner_id, name, description)
      VALUES (?, ?, ?, ?)
    `).bind(id, userId, body.name, body.description || null).run();
    
    // Create default instance
    const instanceId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO instances (id, project_id, owner_id, name)
      VALUES (?, ?, ?, ?)
    `).bind(instanceId, id, userId, 'main').run();
    
    return Response.json({ 
      id, 
      name: body.name, 
      description: body.description,
      defaultInstanceId: instanceId 
    }, { status: 201, headers: corsHeaders });
  }

  // Get single project
  const projectMatch = path.match(/^\/api\/projects\/([\w-]+)$/);
  if (projectMatch && request.method === 'GET') {
    const projectId = projectMatch[1];
    const project = await env.DB.prepare(`
      SELECT id, name, description, created_at, updated_at
      FROM projects WHERE id = ? AND owner_id = ?
    `).bind(projectId, userId).first();
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
  
  // List instances for a project
  const instancesMatch = path.match(/^\/api\/projects\/([\w-]+)\/instances$/);
  if (instancesMatch && request.method === 'GET') {
    const projectId = instancesMatch[1];
    const { results } = await env.DB.prepare(`
      SELECT i.id, i.name, i.is_readonly, i.created_at, i.updated_at
      FROM instances i
      JOIN projects p ON p.id = i.project_id
      WHERE i.project_id = ? AND p.owner_id = ?
      ORDER BY i.created_at DESC
    `).bind(projectId, userId).all();
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

  // Get single instance
  const instanceMatch = path.match(/^\/api\/instances\/([\w-]+)$/);
  if (instanceMatch && request.method === 'GET') {
    const instanceId = instanceMatch[1];
    const instance = await env.DB.prepare(`
      SELECT i.id, i.project_id, i.name, i.is_readonly, i.created_at, i.updated_at
      FROM instances i
      JOIN projects p ON p.id = i.project_id
      WHERE i.id = ? AND p.owner_id = ?
    `).bind(instanceId, userId).first();
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

  return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

