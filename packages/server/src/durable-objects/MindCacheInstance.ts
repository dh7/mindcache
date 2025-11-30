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

interface Session {
  webSocket: WebSocket;
  userId: string;
  permission: 'read' | 'write' | 'admin';
}

export class MindCacheInstanceDO implements DurableObject {
  private sessions: Map<WebSocket, Session> = new Map();
  private sql: SqlStorage;

  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {
    this.sql = state.storage.sql;
    this.initializeDatabase();
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
    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Handle HTTP requests (for REST API fallback)
    return Response.json({ error: 'WebSocket required' }, { status: 400 });
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket
    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
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

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    this.sessions.delete(ws);
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

  private async handleAuth(ws: WebSocket, apiKey: string): Promise<void> {
    // TODO: Verify API key against D1 database
    // For now, accept all connections in development
    
    const session: Session = {
      webSocket: ws,
      userId: 'dev-user',
      permission: 'write',
    };
    
    this.sessions.set(ws, session);

    // Send auth success
    this.send(ws, {
      type: 'auth_success',
      instanceId: this.state.id.toString(),
      userId: session.userId,
      permission: session.permission,
    });

    // Send current state
    const data = this.getAllKeys();
    this.send(ws, {
      type: 'sync',
      data,
      instanceId: this.state.id.toString(),
    });
  }

  private async handleSet(
    ws: WebSocket, 
    key: string, 
    value: unknown, 
    attributes: KeyAttributes
  ): Promise<void> {
    const session = this.sessions.get(ws);
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
    this.broadcast({
      type: 'key_updated',
      key,
      value,
      attributes,
      updatedBy: session.userId,
      timestamp: now,
    }, ws);
  }

  private async handleDelete(ws: WebSocket, key: string): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.permission === 'read') {
      this.sendError(ws, 'Write permission required', 'NO_PERMISSION');
      return;
    }

    const now = Date.now();
    
    this.sql.exec('DELETE FROM keys WHERE name = ?', key);

    // Broadcast to all connected clients
    this.broadcast({
      type: 'key_deleted',
      key,
      deletedBy: session.userId,
      timestamp: now,
    }, ws);
  }

  private async handleClear(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.permission !== 'admin') {
      this.sendError(ws, 'Admin permission required', 'NO_PERMISSION');
      return;
    }

    const now = Date.now();
    
    this.sql.exec('DELETE FROM keys');

    // Broadcast to all connected clients
    this.broadcast({
      type: 'cleared',
      clearedBy: session.userId,
      timestamp: now,
    }, ws);
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
          tags: row.tags ? JSON.parse(row.tags as string) : [],
        },
        updatedAt: row.updated_at as number,
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

  private broadcast(message: ServerMessage, excludeWs?: WebSocket): void {
    for (const [ws] of this.sessions) {
      if (ws !== excludeWs) {
        this.send(ws, message);
      }
    }
  }
}

