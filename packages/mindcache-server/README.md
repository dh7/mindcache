# @mindcache/mindcache-server

Local API server that indexes many MindCache files from a filesystem directory and exposes query endpoints optimized for tag-based context window retrieval.

## What It Does

- Watches a root directory of MindCache files (`.md`, `.markdown`, `.mindcache`, `.json` by default).
- Builds one in-memory aggregate index.
- Uses canonical keys: `relative/path/to/file.ext::rawKey`.
- Applies per-file key-level diffs on updates (only changed keys are rewritten).
- Serves HTTP endpoints for tags, entries, and context windows.

## Install

```bash
npm install @mindcache/mindcache-server
```

## Run

```bash
npx mindcache-server --root ./data --port 4040
```

## CLI Options

- `--root <folder>`: root folder containing MindCache files (required)
- `--host <host>`: HTTP host (default `127.0.0.1`)
- `--port <port>`: HTTP port (default `4040`)
- `--extensions <list>`: comma-separated extensions (default `.md,.markdown,.mindcache,.json`)
- `--poll-interval <ms>`: fallback polling interval (default `5000`, `0` disables)
- `--debounce <ms>`: watch debounce delay (default `200`)
- `--auth-token <token>`: require `Authorization: Bearer <token>` for all endpoints except `/health`
- `--no-watch`: disable filesystem watchers

## API

### Health

```http
GET /health
```

### List tags

```http
GET /v1/tags
```

### Get tags for one key

```http
GET /v1/key-tags?key=team/a/memory.md::customer_profile
```

### Find keys by tags

```http
GET /v1/keys?tags=project,customer&match=all
```

- `match=all` means key must contain all tags.
- `match=any` means key can contain any tag.

### Get entries

```http
GET /v1/entries?tags=project-a&match=all
```

### Get context window

```http
GET /v1/context-window?tags=project-a,customer&match=all
```

or

```http
POST /v1/context-window
Content-Type: application/json

{
  "tags": ["project-a", "customer"],
  "match": "all"
}
```

### Force reconcile

```http
POST /v1/reconcile
```

## Programmatic Usage

```ts
import { MindCacheApiServer, MindCacheServerCore } from '@mindcache/mindcache-server';

const core = new MindCacheServerCore({
  rootDir: '/data/mindcache-files',
  watch: true
});

const api = new MindCacheApiServer({
  core,
  host: '127.0.0.1',
  port: 4040
});

await core.start();
await api.start();
```
