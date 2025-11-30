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
  if (!authData) {
    return Response.json({ error: 'Authorization required' }, { status: 401, headers: corsHeaders });
  }

  let auth;
  if (authData.type === 'jwt') {
    if (!env.CLERK_SECRET_KEY) {
      return Response.json({ error: 'Auth not configured' }, { status: 500, headers: corsHeaders });
    }
    auth = await verifyClerkJWT(authData.token, env.CLERK_SECRET_KEY);
  } else {
    auth = await verifyApiKey(authData.token, env.DB);
  }

  if (!auth.valid) {
    return Response.json({ error: auth.error || 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const userId = auth.userId!;

  // API routes
  if (path === '/api/projects' && request.method === 'GET') {
    // List projects for authenticated user
    // TODO: Implement
    return Response.json({ projects: [] }, { headers: corsHeaders });
  }

  if (path === '/api/projects' && request.method === 'POST') {
    // Create new project
    // TODO: Implement
    return Response.json({ error: 'Not implemented' }, { status: 501, headers: corsHeaders });
  }

  if (path.match(/^\/api\/projects\/[\w-]+\/instances$/) && request.method === 'GET') {
    // List instances for a project
    // TODO: Implement
    return Response.json({ instances: [] }, { headers: corsHeaders });
  }

  return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

