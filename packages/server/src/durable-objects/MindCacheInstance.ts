import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
// @ts-ignore - workspace dependency
import { MindCache } from 'mindcache/server';

import type {
  ClientMessage,
  ServerMessage,
  KeyAttributes,
  KeyEntry
} from '@mindcache/shared';

interface SessionData {
  userId: string;
  permission: 'read' | 'write' | 'admin';
}

interface Env {
  DB: D1Database;
}

const ENCODING_STATUS_KEY = 'yjs_encoded_state';
const SCHEMA_VERSION_KEY = 'schema_version';
const CURRENT_SCHEMA_VERSION = 2; // Bump when schema changes

export class MindCacheInstanceDO extends DurableObject {
  private sql: SqlStorage;
  private doc: Y.Doc;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.doc = new Y.Doc();
    this.initializeDatabase();

    // Load Yjs state if exists, otherwise initialize from SQLite
    ctx.blockConcurrencyWhile(async () => {
      await this.loadState();
    });

    // Initialize Yjs Update Listener
    this.doc.on('update', (update: Uint8Array, origin: any, _doc: Y.Doc, transaction: Y.Transaction) => {

      // Broadcast to clients - wrap update in sync protocol format
      if (origin !== this) {
        const webSockets = this.ctx.getWebSockets();
        for (const ws of webSockets) {
          if (origin !== ws) {
            // Wrap the update in a sync protocol message (messageYjsUpdate = 2)
            const encoder = encoding.createEncoder();
            syncProtocol.writeUpdate(encoder, update);
            this.sendBinary(ws, encoding.toUint8Array(encoder));
          }
        }
      }

      // Update SQLite View (Materialized View)
      const mindcacheMap = this.doc.getMap('mindcache');
      const keysToUpdate = new Set<string>();

      // Check for direct changes to the map (keys added/removed/replaced)
      transaction.changed.forEach((events, type) => {
        // Use string comparison to avoid TypeScript type overlap error
        if (type === mindcacheMap as unknown) {
          events.forEach((key) => {
            if (key && typeof key === 'string') {
              keysToUpdate.add(key);
            }
          });
        }
      });


      // Check for deep changes (properties of entries changed)
      transaction.changedParentTypes.forEach((events, type) => {
        // If type is one of our entry maps, we need to find which key it belongs to.
        // We iterate to find the key. This is acceptable for typical STM sizes.
        if (type.parent === mindcacheMap) {
          // @ts-ignore - internal Yjs property access if needed, or scan
          // Scanning is safer public API usage
          for (const [key, val] of mindcacheMap) {
            if (val === type) {
              keysToUpdate.add(key);
              break;
            }
          }
        }
      });

      if (keysToUpdate.size > 0) {
        this.updateSQLiteFromDoc(Array.from(keysToUpdate));
      }
    });
  }

  // Persist session in WebSocket attachment for hibernation
  private getSession(ws: WebSocket): SessionData | null {
    return (ws as unknown as { deserializeAttachment(): SessionData | null }).deserializeAttachment();
  }

  private setSession(ws: WebSocket, session: SessionData): void {
    (ws as unknown as { serializeAttachment(data: SessionData): void }).serializeAttachment(session);
  }

  private initializeDatabase(): void {
    // Create keys table with new schema
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        content_type TEXT,
        content_tags TEXT,
        system_tags TEXT,
        z_index INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);

    // Run migrations
    this.runMigrations();
  }

  private runMigrations(): void {
    // Check current schema version
    let currentVersion = 0;
    try {
      const cursor = this.sql.exec('SELECT value FROM schema_meta WHERE key = ?', SCHEMA_VERSION_KEY);
      for (const row of cursor) {
        currentVersion = Number(row.value);
      }
    } catch {
      // schema_meta table doesn't exist
      try {
        this.sql.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)');
      } catch {
        // Ignore if exists
      }
    }

    // Migration from v1 (legacy booleans) to v2 (systemTags/contentTags)
    if (currentVersion < 2) {
      // Check if old columns exist
      try {
        const cursor = this.sql.exec('PRAGMA table_info(keys)');
        const columns = new Set<string>();
        for (const row of cursor) {
          columns.add(row.name as string);
        }

        // If we have old columns, migrate them
        if (columns.has('readonly') && !columns.has('system_tags')) {
          // Add new columns
          try {
            this.sql.exec('ALTER TABLE keys ADD COLUMN content_tags TEXT');
          } catch { /* exists */ }
          try {
            this.sql.exec('ALTER TABLE keys ADD COLUMN system_tags TEXT');
          } catch { /* exists */ }

          // Migrate data: convert legacy booleans to systemTags
          const rows = this.sql.exec('SELECT name, readonly, visible, hardcoded, template, tags FROM keys');
          for (const row of rows) {
            const name = row.name as string;
            const systemTags: string[] = [];

            // visible=true => SystemPrompt (or LLMRead)
            if (row.visible) {
              systemTags.push('SystemPrompt');
            }
            // readonly=false => LLMWrite
            if (!row.readonly) {
              systemTags.push('LLMWrite');
            }
            // hardcoded=true => protected
            if (row.hardcoded) {
              systemTags.push('protected');
            }
            // template=true => ApplyTemplate
            if (row.template) {
              systemTags.push('ApplyTemplate');
            }

            // tags become contentTags
            const contentTags = row.tags ? JSON.parse(row.tags as string) : [];

            this.sql.exec(
              'UPDATE keys SET content_tags = ?, system_tags = ? WHERE name = ?',
              JSON.stringify(contentTags),
              JSON.stringify(systemTags),
              name
            );
          }
        }
      } catch (e) {
        console.error('Migration error:', e);
      }

      // Update version
      this.sql.exec(
        'INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)',
        SCHEMA_VERSION_KEY,
        String(CURRENT_SCHEMA_VERSION)
      );
    }
  }

  private async loadState(): Promise<void> {
    // Attempt to load binary state from storage
    const storedState = await this.ctx.storage.get(ENCODING_STATUS_KEY) as Uint8Array | undefined;

    if (storedState) {
      Y.applyUpdate(this.doc, storedState);
    } else {
      // If no Yjs state, hydrate from SQLite (migration path)
      const keys = this.getAllKeys();
      const rootMap = this.doc.getMap('mindcache');

      this.doc.transact(() => {
        Object.entries(keys).forEach(([key, entry]) => {
          const entryMap = new Y.Map();
          entryMap.set('value', entry.value);
          entryMap.set('attributes', entry.attributes);
          rootMap.set(key, entryMap);
        });
      });
      await this.saveState();
    }
  }

  private async saveState(): Promise<void> {
    const update = Y.encodeStateAsUpdate(this.doc);
    await this.ctx.storage.put(ENCODING_STATUS_KEY, update);
  }

  // Update SQLite from Yjs doc to maintain REST API view
  private updateSQLiteFromDoc(keysUpdated: string[]): void {
    const rootMap = this.doc.getMap('mindcache');
    const now = Date.now();

    // Note: Durable Objects SQLite doesn't support raw SQL transactions.
    // Each exec call is atomic. For batch atomicity, use ctx.storage.transactionSync().
    try {
      keysUpdated.forEach(key => {
        const entryMap = rootMap.get(key) as Y.Map<any> | undefined;
        if (!entryMap || !entryMap.has('value')) { // Check if it's a valid entry
          // Key deleted
          this.sql.exec('DELETE FROM keys WHERE name = ?', key);
        } else {
          const value = entryMap.get('value');
          const attributes = entryMap.get('attributes') as KeyAttributes;

          // Safety check
          if (!attributes) {
            return;
          }

          this.sql.exec(`
                    INSERT OR REPLACE INTO keys (name, value, type, content_type, content_tags, system_tags, z_index, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  `,
          key,
          JSON.stringify(value),
          attributes.type,
          attributes.contentType || null,
          JSON.stringify(attributes.contentTags || []),
          JSON.stringify(attributes.systemTags || []),
          attributes.zIndex ?? 0,
          now
          );
        }
      });
    } catch (e) {
      console.error('Failed to update SQLite view', e);
    }
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

    // POST /keys - Set a key (Legacy bridge)
    if (url.pathname === '/keys' && request.method === 'POST') {
      const body = await request.json() as {
        key: string;
        value: unknown;
        attributes: KeyAttributes;
        userId?: string;
      };

      const rootMap = this.doc.getMap('mindcache');
      this.doc.transact(() => {
        const entryMap = new Y.Map();
        entryMap.set('value', body.value);
        entryMap.set('attributes', body.attributes);
        rootMap.set(body.key, entryMap);
      }, 'rest-api');

      await this.saveState();
      // updateSQLiteFromDoc is triggered by update listener

      return Response.json({ success: true });
    }

    // DELETE /keys/:key - Delete a key
    if (url.pathname.startsWith('/keys/') && request.method === 'DELETE') {
      const key = decodeURIComponent(url.pathname.slice(6));

      const rootMap = this.doc.getMap('mindcache');
      this.doc.transact(() => {
        rootMap.delete(key);
      }, 'rest-api');

      await this.saveState();

      return Response.json({ success: true });
    }

    // DELETE /destroy - Delete all storage and close connections
    if (url.pathname === '/destroy' && request.method === 'DELETE') {
      // Close all WebSocket connections
      const webSockets = this.ctx.getWebSockets();
      for (const ws of webSockets) {
        try {
          ws.close(1000, 'Instance deleted');
        } catch {
          // Ignore close errors
        }
      }

      // Delete all storage
      await this.ctx.storage.deleteAll();
      // Reset doc
      this.doc = new Y.Doc();

      return Response.json({ success: true });
    }

    // POST /import - Import Markdown content directly (Server-Side Hydration)
    if (url.pathname === '/import' && request.method === 'POST') {
      const body = await request.json() as { markdown: string };

      if (typeof body.markdown !== 'string') {
        return Response.json({ error: 'Markdown content required' }, { status: 400 });
      }

      // Use SDK with local doc for direct manipulation
      const sdk = this.getSDK();
      sdk.fromMarkdown(body.markdown);

      // Persist state
      await this.saveState();

      return Response.json({ success: true, message: 'Imported successfully' });
    }

    return Response.json({ error: 'Endpoint not found or method not allowed' }, { status: 404 });
  }

  // Helper to get SDK instance wrapping local doc
  private getSDK(): MindCache {
    return new MindCache({
      doc: this.doc,
      accessLevel: 'system'
    });
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Check if pre-authenticated by Worker (token auth)
    const preAuth = request.headers.get('X-MindCache-PreAuth') === 'true';
    const userId = request.headers.get('X-MindCache-UserId') || 'unknown';
    const permission = (request.headers.get('X-MindCache-Permission') || 'read') as 'read' | 'write' | 'admin';

    // Accept the WebSocket
    this.ctx.acceptWebSocket(server);

    // If pre-authenticated, set session and send sync immediately
    if (preAuth) {
      const session: SessionData = { userId, permission };
      this.setSession(server, session);

      // Send auth success
      this.send(server, {
        type: 'auth_success',
        instanceId: this.ctx.id.toString(),
        userId: session.userId,
        permission: session.permission
      });

      // Start Yjs Sync
      this.startSync(server);
    }

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private startSync(ws: WebSocket) {
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.sendBinary(ws, encoding.toUint8Array(encoder));
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {

    // Handle legacy JSON messages
    if (typeof message === 'string') {
      try {
        const data = JSON.parse(message as string) as ClientMessage;
        if (data.type === 'auth') {
          // Mock auth
          const session: SessionData = { userId: 'dev-user', permission: 'write' };
          this.setSession(ws, session);
          this.send(ws, { type: 'auth_success', instanceId: this.ctx.id.toString(), userId: 'dev', permission: 'write' });
          this.startSync(ws);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        this.sendError(ws, 'Invalid message format', 'PARSE_ERROR');
      }
      return;
    }

    // Handle Yjs Binary messages
    if (message instanceof ArrayBuffer) {
      const update = new Uint8Array(message);
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(update);

      // This helper handles Sync Step 1, Step 2, and Update exchange automatically
      // The doc.on('update') listener will broadcast changes to other clients
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);

      // If the encoder has content (response), send it back to the sender
      if (encoding.length(encoder) > 0) {
        this.sendBinary(ws, encoding.toUint8Array(encoder));
      }

      await this.saveState();
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Session is attached to ws, cleaned up automatically
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    // Session is attached to ws, cleaned up automatically
  }

  private getAllKeys(): Record<string, KeyEntry> {
    const result: Record<string, KeyEntry> = {};

    const cursor = this.sql.exec('SELECT * FROM keys ORDER BY z_index ASC, name ASC');

    for (const row of cursor) {
      const name = row.name as string;

      // Parse tags from JSON
      let contentTags: string[] = [];
      let systemTags: string[] = [];

      try {
        contentTags = row.content_tags ? JSON.parse(row.content_tags as string) : [];
      } catch { /* ignore */ }

      try {
        systemTags = row.system_tags ? JSON.parse(row.system_tags as string) : [];
      } catch { /* ignore */ }

      result[name] = {
        value: JSON.parse(row.value as string),
        attributes: {
          type: row.type as KeyAttributes['type'],
          contentType: row.content_type as string | undefined,
          contentTags,
          systemTags: systemTags as KeyAttributes['systemTags'],
          zIndex: row.z_index !== undefined ? (row.z_index as number) : 0
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

  private sendBinary(ws: WebSocket, message: Uint8Array): void {
    try {
      ws.send(message);
    } catch { /* Ignore send errors for disconnected clients */ }
  }


  private sendError(ws: WebSocket, error: string, code: string): void {
    this.send(ws, { type: 'error', error, code });
  }

  private broadcast(message: ServerMessage): void {
    // Use state.getWebSockets() which survives hibernation
    const webSockets = this.ctx.getWebSockets();
    for (const ws of webSockets) {
      this.send(ws, message);
    }
  }

  private broadcastBinary(message: Uint8Array, exclude?: WebSocket): void {
    // Broadcast binary (Yjs) message to all clients except the sender
    const webSockets = this.ctx.getWebSockets();
    for (const ws of webSockets) {
      if (ws !== exclude) {
        this.sendBinary(ws, message);
      }
    }
  }
}
