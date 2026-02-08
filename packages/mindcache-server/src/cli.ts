#!/usr/bin/env node
import path from 'node:path';

import { MindCacheApiServer } from './MindCacheApiServer';
import { MindCacheServerCore } from './MindCacheServerCore';

interface ParsedArgs {
  rootDir: string;
  host: string;
  port: number;
  watch: boolean;
  pollIntervalMs: number;
  debounceMs: number;
  extensions: string[];
  authToken?: string;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`mindcache-server

Usage:
  mindcache-server --root <folder> [options]

Options:
  --root <folder>         Root folder containing MindCache files (required)
  --host <host>           HTTP host (default: 127.0.0.1)
  --port <port>           HTTP port (default: 4040)
  --extensions <list>     Comma-separated file extensions (default: .md,.markdown,.mindcache,.json)
  --poll-interval <ms>    Polling interval fallback in milliseconds (default: 5000)
  --debounce <ms>         Debounce for watch events in milliseconds (default: 200)
  --auth-token <token>    Require bearer token for all endpoints except /health
  --no-watch              Disable filesystem watchers
  --help                  Show this help

Examples:
  mindcache-server --root ./data
  mindcache-server --root /data/mindcache --port 5050 --auth-token secret
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    rootDir: '',
    host: '127.0.0.1',
    port: 4040,
    watch: true,
    pollIntervalMs: 5000,
    debounceMs: 200,
    extensions: ['.md', '.markdown', '.mindcache', '.json']
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--no-watch') {
      args.watch = false;
      continue;
    }

    const value = argv[i + 1];

    switch (arg) {
      case '--root':
        args.rootDir = value || '';
        i++;
        break;
      case '--host':
        args.host = value || args.host;
        i++;
        break;
      case '--port':
        args.port = Number(value) || args.port;
        i++;
        break;
      case '--poll-interval':
        args.pollIntervalMs = Number(value) || args.pollIntervalMs;
        i++;
        break;
      case '--debounce':
        args.debounceMs = Number(value) || args.debounceMs;
        i++;
        break;
      case '--extensions':
        args.extensions = (value || '')
          .split(',')
          .map(extension => extension.trim())
          .filter(Boolean);
        i++;
        break;
      case '--auth-token':
        args.authToken = value;
        i++;
        break;
      default:
        break;
    }
  }

  if (!args.rootDir) {
    throw new Error('--root is required');
  }

  if (!Number.isFinite(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error('--port must be between 1 and 65535');
  }

  if (!Number.isFinite(args.pollIntervalMs) || args.pollIntervalMs < 0) {
    throw new Error('--poll-interval must be >= 0');
  }

  if (!Number.isFinite(args.debounceMs) || args.debounceMs < 0) {
    throw new Error('--debounce must be >= 0');
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const core = new MindCacheServerCore({
    rootDir: path.resolve(args.rootDir),
    includeExtensions: args.extensions,
    watch: args.watch,
    pollIntervalMs: args.pollIntervalMs,
    debounceMs: args.debounceMs
  });

  const api = new MindCacheApiServer({
    core,
    host: args.host,
    port: args.port,
    authToken: args.authToken
  });

  await core.start();
  await api.start();

  const shutdown = async () => {
    await api.stop();
    await core.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main().catch(error => {
  // eslint-disable-next-line no-console
  console.error(`[mindcache-server] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
