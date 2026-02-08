import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

import type {
  ContextWindowQuery,
  Logger,
  MindCacheApiServerOptions,
  MindCacheServerCoreApi,
  TagMatchMode
} from './types';

const defaultLogger: Logger = {
  info: (message: string) => {
    // eslint-disable-next-line no-console
    console.log(message);
  },
  warn: (message: string) => {
    // eslint-disable-next-line no-console
    console.warn(message);
  },
  error: (message: string) => {
    // eslint-disable-next-line no-console
    console.error(message);
  }
};

interface ParsedRequest {
  pathname: string;
  query: URLSearchParams;
}

export class MindCacheApiServer {
  private readonly core: MindCacheServerCoreApi;
  private readonly host: string;
  private readonly port: number;
  private readonly authToken?: string;
  private readonly logger: Logger;
  private server: Server | null = null;

  constructor(options: MindCacheApiServerOptions) {
    this.core = options.core;
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 4040;
    this.authToken = options.authToken;
    this.logger = options.logger || defaultLogger;
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server?.off('error', reject);
        resolve();
      });
    });

    this.logger.info(`[mindcache-server] API listening on http://${this.host}:${this.port}`);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.applyCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsed = this.parseRequest(req);
    if (!parsed) {
      this.sendJson(res, 400, { error: 'Invalid URL' });
      return;
    }

    if (parsed.pathname !== '/health' && parsed.pathname !== '/' && !this.isAuthorized(req)) {
      this.sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      if (req.method === 'GET' && parsed.pathname === '/') {
        this.sendJson(res, 200, {
          name: 'mindcache-server',
          status: 'ok',
          endpoints: [
            'GET /health',
            'GET /v1/stats',
            'GET /v1/tags',
            'GET /v1/key-tags?key=<canonicalKey>',
            'GET /v1/keys?tags=tag1,tag2&match=all|any',
            'GET /v1/entries?tags=tag1,tag2&match=all|any',
            'GET /v1/context-window?tags=tag1,tag2&match=all|any',
            'POST /v1/context-window',
            'POST /v1/reconcile'
          ]
        });
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/health') {
        this.sendJson(res, 200, {
          status: 'ok',
          ...this.core.getStats()
        });
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/v1/stats') {
        this.sendJson(res, 200, this.core.getStats());
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/v1/tags') {
        this.sendJson(res, 200, { tags: this.core.getAllTags() });
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/v1/key-tags') {
        const key = parsed.query.get('key') || '';
        if (!key) {
          this.sendJson(res, 400, { error: 'Missing required query parameter: key' });
          return;
        }
        this.sendJson(res, 200, {
          key,
          tags: this.core.getTagsForKey(key)
        });
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/v1/keys') {
        const query = this.queryFromSearchParams(parsed.query);
        const keys = this.core.findKeysByTags(query.tags || [], query.match);
        this.sendJson(res, 200, {
          tags: query.tags || [],
          match: query.match,
          count: keys.length,
          keys
        });
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/v1/entries') {
        const query = this.queryFromSearchParams(parsed.query);
        const entries = this.core.listEntries(query);
        this.sendJson(res, 200, {
          tags: query.tags || [],
          match: query.match,
          count: entries.length,
          entries
        });
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/v1/context-window') {
        const query = this.queryFromSearchParams(parsed.query);
        const result = this.core.getContextWindow(query);
        this.sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && parsed.pathname === '/v1/context-window') {
        const body = await this.readBody(req);
        const query = this.queryFromBody(body);
        const result = this.core.getContextWindow(query);
        this.sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && parsed.pathname === '/v1/reconcile') {
        await this.core.reconcile('api');
        this.sendJson(res, 200, {
          ok: true,
          ...this.core.getStats()
        });
        return;
      }

      this.sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isBadRequest = message === 'Invalid JSON body';
      this.logger.error(`[mindcache-server] Request error: ${error instanceof Error ? error.message : String(error)}`);
      this.sendJson(res, isBadRequest ? 400 : 500, {
        error: isBadRequest ? message : (error instanceof Error ? error.message : 'Internal server error')
      });
    }
  }

  private parseRequest(req: IncomingMessage): ParsedRequest | null {
    if (!req.url) {
      return null;
    }

    try {
      const url = new URL(req.url, 'http://localhost');
      return {
        pathname: url.pathname,
        query: url.searchParams
      };
    } catch {
      return null;
    }
  }

  private queryFromSearchParams(params: URLSearchParams): ContextWindowQuery {
    const tags = this.parseTags(params.get('tags'));
    const match = this.parseMatch(params.get('match'));
    return { tags, match };
  }

  private queryFromBody(body: unknown): ContextWindowQuery {
    const object = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const tagsValue = object.tags;
    const tags = Array.isArray(tagsValue)
      ? tagsValue.filter(tag => typeof tag === 'string') as string[]
      : [];

    const match = this.parseMatch(typeof object.match === 'string' ? object.match : null);

    return { tags, match };
  }

  private parseTags(raw: string | null): string[] {
    if (!raw) {
      return [];
    }

    return raw
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  private parseMatch(raw: string | null): TagMatchMode {
    if (raw === 'any') {
      return 'any';
    }
    return 'all';
  }

  private async readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }

    if (chunks.length === 0) {
      return {};
    }

    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (!rawBody.trim()) {
      return {};
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      throw new Error('Invalid JSON body');
    }
  }

  private isAuthorized(req: IncomingMessage): boolean {
    if (!this.authToken) {
      return true;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    return token === this.authToken;
  }

  private sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
  }

  private applyCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
}
