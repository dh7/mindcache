import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CLIENT_DIR } from './config.ts';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function contentTypeFor(filePath: string): string {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveClientFile(requestPath: string): string | null {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const absolutePath = path.resolve(CLIENT_DIR, `.${normalizedPath}`);

  if (!absolutePath.startsWith(CLIENT_DIR)) {
    return null;
  }

  return absolutePath;
}

export async function startClientServer(host: string, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const requestPath = req.url?.split('?')[0] || '/';
    const filePath = resolveClientFile(requestPath);

    if (!filePath) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      res.setHeader('Content-Type', contentTypeFor(filePath));
      res.statusCode = 200;
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}
