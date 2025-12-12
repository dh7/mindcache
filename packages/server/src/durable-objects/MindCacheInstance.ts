/**
 * MindCacheInstance Durable Object
 *
 * Each MindCache Instance maps to one Durable Object.
 * Handles:
 * - Key-value storage (SQLite)
 * - WebSocket connections for real-time sync
 * - Broadcasting changes to all connected clients
 */

import type {
  ClientMessage,
  ServerMessage,
  KeyAttributes,
  KeyEntry
} from '@mindcache/shared';

interface SessionData {
  userId: string;
  permission: 'read' | 'write' | 'admin';  // Standardized to 'admin' everywhere
}

export class MindCacheInstanceDO implements DurableObject {
  private sql: SqlStorage;

  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {
    this.sql = state.storage.sql;
    this.initializeDatabase();
  }

  // Use WebSocket attachment for hibernation-safe session storage
  private getSession(ws: WebSocket): SessionData | null {
    return (ws as unknown as { deserializeAttachment(): SessionData | null }).deserializeAttachment();
  }

  private setSession(ws: WebSocket, session: SessionData): void {
    (ws as unknown as { serializeAttachment(data: SessionData): void }).serializeAttachment(session);
  }

  private initializeDatabase(): void {
    // Create keys table if it doesn't exist
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        content_type TEXT,
        readonly INTEGER NOT NULL DEFAULT 0,
        visible INTEGER NOT NULL DEFAULT 1,
        hardcoded INTEGER NOT NULL DEFAULT 0,
        template INTEGER NOT NULL DEFAULT 0,
        tags TEXT,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Handle internal HTTP requests (from AI module)
    // GET /keys - Get all keys
    if (url.pathname === '/keys' && request.method === 'GET') {
      const keys = this.getAllKeys();
      return Response.json(keys);
    }

    // POST /keys - Set a key
    if (url.pathname === '/keys' && request.method === 'POST') {
      const body = await request.json() as {
        key: string;
        value: unknown;
        attributes: KeyAttributes;
        userId?: string;
      };

      const now = Date.now();
      this.sql.exec(`
        INSERT OR REPLACE INTO keys (name, value, type, content_type, readonly, visible, hardcoded, template, tags, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      body.key,
      JSON.stringify(body.value),
      body.attributes.type,
      body.attributes.contentType || null,
      body.attributes.readonly ? 1 : 0,
      body.attributes.visible ? 1 : 0,
      body.attributes.hardcoded ? 1 : 0,
      body.attributes.template ? 1 : 0,
      body.attributes.tags ? JSON.stringify(body.attributes.tags) : null,
      now
      );

      // Broadcast to connected WebSocket clients
      this.broadcast({
        type: 'key_updated',
        key: body.key,
        value: body.value,
        attributes: body.attributes,
        updatedBy: body.userId || 'system',
        timestamp: now
      });

      return Response.json({ success: true });
    }

    // DELETE /keys/:key - Delete a key
    if (url.pathname.startsWith('/keys/') && request.method === 'DELETE') {
      const key = decodeURIComponent(url.pathname.slice(6));
      const now = Date.now();

      this.sql.exec('DELETE FROM keys WHERE name = ?', key);

      // Broadcast to connected WebSocket clients
      this.broadcast({
        type: 'key_deleted',
        key,
        deletedBy: 'system',
        timestamp: now
      });

      return Response.json({ success: true });
    }

    // DELETE /destroy - Delete all storage and close connections
    if (url.pathname === '/destroy' && request.method === 'DELETE') {
      // Close all WebSocket connections
      const webSockets = this.state.getWebSockets();
      for (const ws of webSockets) {
        try {
          ws.close(1000, 'Instance deleted');
        } catch {
          // Ignore close errors
        }
      }

      // Delete all storage
      await this.state.storage.deleteAll();

      return Response.json({ success: true });
    }

    return Response.json({ error: 'WebSocket required or invalid endpoint' }, { status: 400 });
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Check if pre-authenticated by Worker (token auth)
    const preAuth = request.headers.get('X-MindCache-PreAuth') === 'true';
    const userId = request.headers.get('X-MindCache-UserId') || 'unknown';
    const permission = (request.headers.get('X-MindCache-Permission') || 'read') as 'read' | 'write' | 'admin';

    // Accept the WebSocket
    this.state.acceptWebSocket(server);

    // If pre-authenticated, set session and send sync immediately
    if (preAuth) {
      const session: SessionData = { userId, permission };
      this.setSession(server, session);

      // Send auth success
      this.send(server, {
        type: 'auth_success',
        instanceId: this.state.id.toString(),
        userId: session.userId,
        permission: session.permission
      });

      // Send current state
      const data = this.getAllKeys();
      this.send(server, {
        type: 'sync',
        data,
        instanceId: this.state.id.toString()
      });
    }

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(message as string) as ClientMessage;
      await this.handleMessage(ws, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
      this.sendError(ws, 'Invalid message format', 'PARSE_ERROR');
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Session is attached to ws, cleaned up automatically
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    // Session is attached to ws, cleaned up automatically
  }

  private async handleMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'auth':
        await this.handleAuth(ws, message.apiKey);
        break;

      case 'set':
        await this.handleSet(ws, message.key, message.value, message.attributes);
        break;

      case 'delete':
        await this.handleDelete(ws, message.key);
        break;

      case 'clear':
        await this.handleClear(ws);
        break;

      case 'ping':
        this.send(ws, { type: 'pong' });
        break;
    }
  }

  private async handleAuth(ws: WebSocket, _apiKey: string): Promise<void> {
    // TODO: Verify API key against D1 database
    // For now, accept all connections in development

    const session: SessionData = {
      userId: 'dev-user',
      permission: 'write'
    };

    // Attach session to WebSocket (survives hibernation)
    this.setSession(ws, session);

    // Send auth success
    this.send(ws, {
      type: 'auth_success',
      instanceId: this.state.id.toString(),
      userId: session.userId,
      permission: session.permission
    });

    // Send current state
    const data = this.getAllKeys();
    this.send(ws, {
      type: 'sync',
      data,
      instanceId: this.state.id.toString()
    });
  }

  private async handleSet(
    ws: WebSocket,
    key: string,
    value: unknown,
    attributes: KeyAttributes
  ): Promise<void> {
    const session = this.getSession(ws);
    if (!session || session.permission === 'read') {
      this.sendError(ws, 'Write permission required', 'NO_PERMISSION');
      return;
    }

    const now = Date.now();

    // Store in SQLite
    this.sql.exec(`
      INSERT OR REPLACE INTO keys (name, value, type, content_type, readonly, visible, hardcoded, template, tags, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    key,
    JSON.stringify(value),
    attributes.type,
    attributes.contentType || null,
    attributes.readonly ? 1 : 0,
    attributes.visible ? 1 : 0,
    attributes.hardcoded ? 1 : 0,
    attributes.template ? 1 : 0,
    attributes.tags ? JSON.stringify(attributes.tags) : null,
    now
    );

    // Broadcast to all connected clients
    // Broadcast to ALL clients including sender for real-time sync
    this.broadcast({
      type: 'key_updated',
      key,
      value,
      attributes,
      updatedBy: session.userId,
      timestamp: now
    });
  }

  private async handleDelete(ws: WebSocket, key: string): Promise<void> {
    const session = this.getSession(ws);
    if (!session || session.permission === 'read') {
      this.sendError(ws, 'Write permission required', 'NO_PERMISSION');
      return;
    }

    const now = Date.now();

    this.sql.exec('DELETE FROM keys WHERE name = ?', key);

    // Broadcast to all connected clients
    // Broadcast to ALL clients including sender
    this.broadcast({
      type: 'key_deleted',
      key,
      deletedBy: session.userId,
      timestamp: now
    });
  }

  private async handleClear(ws: WebSocket): Promise<void> {
    const session = this.getSession(ws);
    // 'admin' permission required for system operations
    if (!session || session.permission !== 'admin') {
      this.sendError(ws, 'System permission required', 'NO_PERMISSION');
      return;
    }

    const now = Date.now();

    this.sql.exec('DELETE FROM keys');

    // Broadcast to all connected clients
    // Broadcast to ALL clients including sender
    this.broadcast({
      type: 'cleared',
      clearedBy: session.userId,
      timestamp: now
    });
  }

  private getAllKeys(): Record<string, KeyEntry> {
    const result: Record<string, KeyEntry> = {};

    const cursor = this.sql.exec('SELECT * FROM keys');

    for (const row of cursor) {
      const name = row.name as string;
      result[name] = {
        value: JSON.parse(row.value as string),
        attributes: {
          type: row.type as KeyAttributes['type'],
          contentType: row.content_type as string | undefined,
          readonly: Boolean(row.readonly),
          visible: Boolean(row.visible),
          hardcoded: Boolean(row.hardcoded),
          template: Boolean(row.template),
          tags: row.tags ? JSON.parse(row.tags as string) : []
        },
        updatedAt: row.updated_at as number
      };
    }

    return result;
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  private sendError(ws: WebSocket, error: string, code: string): void {
    this.send(ws, { type: 'error', error, code });
  }

  private broadcast(message: ServerMessage): void {
    // Use state.getWebSockets() which survives hibernation
    const webSockets = this.state.getWebSockets();
    for (const ws of webSockets) {
      this.send(ws, message);
    }
  }
}

