/**
 * Clerk webhook handlers for user sync
 * 
 * Clerk sends webhooks when users are created/updated/deleted
 * We sync this data to our D1 database
 */

import { Env } from '../worker';

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    first_name?: string;
    last_name?: string;
    created_at?: number;
    updated_at?: number;
  };
}

/**
 * Verify Clerk webhook signature
 * https://clerk.com/docs/integrations/webhooks/sync-data
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;

  try {
    // Clerk uses Svix for webhooks
    // The signature format is: v1,TIMESTAMP,SIGNATURE
    const parts = signature.split(',');
    if (parts.length < 3) return false;

    const timestamp = parts[1];
    const sig = parts[2];

    // Verify timestamp is recent (within 5 minutes)
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
      return false;
    }

    // Create the signed payload
    const signedPayload = `${timestamp}.${payload}`;
    
    // Verify HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const expectedSig = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );
    
    const expectedSigHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return sig === expectedSigHex;
  } catch {
    return false;
  }
}

/**
 * Handle Clerk webhook events
 */
export async function handleClerkWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const payload = await request.text();
    const signature = request.headers.get('svix-signature');
    
    // In production, verify the webhook signature
    // For now, we'll skip verification in development
    if (env.ENVIRONMENT !== 'development') {
      const webhookSecret = env.CLERK_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
      }
      
      const isValid = await verifyWebhookSignature(payload, signature, webhookSecret);
      if (!isValid) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const event = JSON.parse(payload) as ClerkWebhookEvent;

    switch (event.type) {
      case 'user.created':
        await handleUserCreated(event.data, env.DB);
        break;
      
      case 'user.updated':
        await handleUserUpdated(event.data, env.DB);
        break;
      
      case 'user.deleted':
        await handleUserDeleted(event.data.id, env.DB);
        break;
      
      default:
        // Ignore other event types
        break;
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleUserCreated(
  data: ClerkWebhookEvent['data'],
  db: D1Database
): Promise<void> {
  const email = data.email_addresses?.[0]?.email_address || null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;

  await db.prepare(`
    INSERT INTO users (id, clerk_id, email, name, created_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(clerk_id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name
  `).bind(
    crypto.randomUUID(),
    data.id,
    email,
    name
  ).run();
}

async function handleUserUpdated(
  data: ClerkWebhookEvent['data'],
  db: D1Database
): Promise<void> {
  const email = data.email_addresses?.[0]?.email_address || null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;

  await db.prepare(`
    UPDATE users SET email = ?, name = ? WHERE clerk_id = ?
  `).bind(email, name, data.id).run();
}

async function handleUserDeleted(
  clerkId: string,
  db: D1Database
): Promise<void> {
  // Note: This will cascade delete projects, instances, etc.
  // depending on your foreign key constraints
  await db.prepare(`
    DELETE FROM users WHERE clerk_id = ?
  `).bind(clerkId).run();
}

