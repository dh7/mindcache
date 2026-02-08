import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { MindCache } from '../../../packages/mindcache/dist/server.mjs';

import { API_HOST, API_PORT, DATA_DIR } from './config.ts';

type MatchMode = 'all' | 'any';

interface IndexedEntry {
  key: string;
  rawKey: string;
  fileId: string;
  value: unknown;
  attributes: {
    type: string;
    contentType?: string;
    contentTags: string[];
    systemTags: string[];
    zIndex: number;
    customType?: string;
  };
}

interface RuntimeHandle {
  stop: () => Promise<void>;
}

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.mindcache', '.json']);

function canonicalFileId(rootDir: string, absolutePath: string): string {
  const relative = path.relative(rootDir, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path outside root: ${absolutePath}`);
  }
  return relative.split(path.sep).join('/');
}

function parseTags(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function matchTags(entryTags: string[], filterTags: string[], mode: MatchMode): boolean {
  if (filterTags.length === 0) {
    return true;
  }

  if (mode === 'any') {
    return filterTags.some(tag => entryTags.includes(tag));
  }

  return filterTags.every(tag => entryTags.includes(tag));
}

async function listMindCacheFiles(rootDir: string): Promise<Array<{ fileId: string; absolutePath: string }>> {
  const files: Array<{ fileId: string; absolutePath: string }> = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let dirEntries;
    try {
      dirEntries = await fs.readdir(current, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      continue;
    }

    for (const entry of dirEntries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          stack.push(path.join(current, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(current, entry.name);
      const extension = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        continue;
      }

      files.push({
        fileId: canonicalFileId(rootDir, absolutePath),
        absolutePath
      });
    }
  }

  return files;
}

function parseFileContent(filePath: string, content: string): Record<string, { value: unknown; attributes: any }> {
  const extension = path.extname(filePath).toLowerCase();
  const cache = new MindCache({ accessLevel: 'admin' });

  if (extension === '.json') {
    const parsed = JSON.parse(content);
    cache.deserialize(parsed);
  } else {
    cache.fromMarkdown(content, false);
  }

  return cache.serialize() as Record<string, { value: unknown; attributes: any }>;
}

async function loadIndex(rootDir: string): Promise<{ tags: string[]; entries: IndexedEntry[] }> {
  const files = await listMindCacheFiles(rootDir);
  const entries: IndexedEntry[] = [];
  const tags = new Set<string>();

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file.absolutePath, 'utf8');
    } catch {
      continue;
    }

    let parsed: Record<string, { value: unknown; attributes: any }>;
    try {
      parsed = parseFileContent(file.absolutePath, content);
    } catch {
      continue;
    }

    for (const [rawKey, entry] of Object.entries(parsed)) {
      if (rawKey.startsWith('$')) {
        continue;
      }

      const contentTags = Array.from(new Set((entry.attributes?.contentTags || []) as string[]));
      for (const tag of contentTags) {
        tags.add(tag);
      }

      entries.push({
        key: `${file.fileId}::${rawKey}`,
        rawKey,
        fileId: file.fileId,
        value: entry.value,
        attributes: {
          type: entry.attributes?.type || 'text',
          contentType: entry.attributes?.contentType,
          contentTags,
          systemTags: Array.from(new Set((entry.attributes?.systemTags || []) as string[])),
          zIndex: entry.attributes?.zIndex ?? 0,
          customType: entry.attributes?.customType
        }
      });
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));

  return {
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
    entries
  };
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function withCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' && req.method === 'GET') {
    sendJson(res, 200, {
      name: 'mindcache-server-local-example',
      status: 'ok',
      endpoints: [
        'GET /health',
        'GET /v1/tags',
        'GET /v1/entries?tags=tag1,tag2&match=all|any'
      ]
    });
    return;
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    const index = await loadIndex(DATA_DIR);
    sendJson(res, 200, {
      status: 'ok',
      rootDir: DATA_DIR,
      tags: index.tags.length,
      keys: index.entries.length
    });
    return;
  }

  if (url.pathname === '/v1/tags' && req.method === 'GET') {
    const index = await loadIndex(DATA_DIR);
    sendJson(res, 200, { tags: index.tags });
    return;
  }

  if (url.pathname === '/v1/entries' && req.method === 'GET') {
    const filterTags = parseTags(url.searchParams.get('tags'));
    const mode = url.searchParams.get('match') === 'any' ? 'any' : 'all';

    const index = await loadIndex(DATA_DIR);
    const entries = index.entries.filter(entry => matchTags(entry.attributes.contentTags, filterTags, mode));

    sendJson(res, 200, {
      tags: filterTags,
      match: mode,
      count: entries.length,
      entries
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

export async function startMindCacheRuntime(): Promise<RuntimeHandle> {
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(error => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(API_PORT, API_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    stop: async () => {
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
  };
}
