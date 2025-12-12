# MindCache 3.0 Specification

**Version**: 0.2-draft  
**Last Updated**: 2024-12-09

## Overview

MindCache 3.0 is a **modular architecture** that separates concerns into distinct, independently deployable packages:

| Package | Purpose | Deployment | Repo |
|---------|---------|------------|------|
| `mindcache` | Core state management | npm (client/server) | Public |
| `mindcache/cloud` | CloudAdapter for real-time sync | npm (client/server) | Public |
| `mindcore` | AI tools & actions server | npm (anywhere) | Public |
| `mindcache-cli` | Admin CLI for self-hosters | npm (global) | Public |
| `mindcache-server` | Durable Objects + D1 | Cloudflare (self-hostable) | Public |
| `mindcache-web` | Dashboard & management | Vercel (managed only) | **Private** |

**Key Principle**: Everyone uses `npm install mindcache` — both clients and tools services. No one needs to understand Durable Objects.

---

## Architecture

### The Core Pattern

```
┌───────────────────────────┐     ┌───────────────────────────┐
│  Client App               │     │  MindCore (Tools Service) │
│                           │     │                           │
│  const mc = new MindCache({     │  const mc = new MindCache({
│    cloud: { instanceId }  │     │    cloud: { instanceId,   │
│  });                      │     │  });                      │
│                           │     │                           │
│  // UI reacts to changes  │     │  // AI writes results     │
│  mc.subscribe(...)        │     │  mc.set('result', data)   │
└───────────┬───────────────┘     └───────────┬───────────────┘
            │                                 │
            │  WebSocket                      │  WebSocket
            ↓                                 ↓
         ┌────────────────────────────────────────┐
         │              Durable Object            │
         │                (SQLite)                │
         │                                        │
         │  broadcast() → all connected clients   │
         └────────────────────────────────────────┘
```

**Both client and tools service:**
1. Use the same `MindCache` class with `CloudAdapter`
2. Mindcache connect to the same Durable Object via WebSocket
3. Stay in sync automatically (DO broadcasts all changes)
4. Use identical API: `mc.set()`, `mc.get()`, `mc.subscribe()`

---

## NPM Packages

### 1. `mindcache` (Core + Cloud)

Single npm package with optional cloud sync via subpath export.

```typescript
// Local only (1.0 behavior, small bundle)
import { MindCache } from 'mindcache';
const mc = new MindCache();
mc.set('name', 'Alice');

// With cloud sync (2.0+)
import { MindCache } from 'mindcache/cloud';
const mc = new MindCache({
  cloud: {
    instanceId: 'abc123',
  }
});

// Same API!
mc.set('name', 'Alice');
mc.subscribe('name', (value) => console.log(value));
```

**Package exports:**
```json
{
  "name": "mindcache",
  "exports": {
    ".": "./dist/index.mjs",
    "./cloud": "./dist/cloud/index.mjs"
  }
}
```

### 2. `mindcore` (AI Tools Server)

Standalone package for AI-powered tools that read/write MindCache.

```typescript
import { MindCore } from 'mindcore';

// Initialize with MindCache cloud connection
const core = new MindCore({
  instanceId: 'abc123',
  apiKey: 'mc_xxx',
  openaiKey: 'sk-xxx',
});

// Chat with MindCache-aware tools
const response = await core.chat({
  messages: [{ role: 'user', content: 'Save my name as Alice' }],
  mode: 'use',  // or 'edit'
});

// Or use individual tools
await core.tools.writeKey('name', 'Alice');
await core.tools.generateImage('prompt_key', 'output_key');
await core.tools.webSearch('query_key', 'results_key');
```

**Deployment options:**

| Environment | How |
|-------------|-----|
| Client-side | User provides their own API keys |
| Vercel/Node | API route receives instanceId + apiKey per request |
| Cloudflare | Direct DO access (fastest, for managed service) |

---

## Developer Experience

### The Upgrade Path

**Step 1: Start Local**
```typescript
import { MindCache } from 'mindcache';
const mc = new MindCache();

mc.set('user', 'Alice');
mc.set('preferences', { theme: 'dark' });
// Works immediately, stored in memory
```

**Step 2: Create Account**
- Go to `app.mindcache.dev`
- Create account (OAuth)
- Create project + instance
- Copy instance ID

**Step 3: Add Cloud Config (one line change)**
```typescript
import { MindCache } from 'mindcache/cloud';  // Changed import
const mc = new MindCache({
  cloud: {                                     // Added config
    instanceId: 'abc123',
    tokenEndpoint: '/api/ws-token',
  }
});

mc.set('user', 'Alice');  // Same API, now synced!
```

**That's it.** Zero API changes. Same `mc.set()`, `mc.get()`, `mc.subscribe()`.

---

## Package Responsibilities

### `mindcache`

Core in-memory state management (unchanged from 1.0):

- Key-value storage with types: `text`, `json`, `image`, `file`
- Attributes: `readonly`, `visible`, `hardcoded`, `tags`
- Template injection: `{{key}}` syntax
- System prompt generation (keys tagged `SystemPrompt`)
- Serialization (JSON, Markdown)
- Subscriptions and events

### `mindcache/cloud`

CloudAdapter for real-time sync:

- WebSocket connection to Durable Object
- Automatic reconnection with exponential backoff
- Token-based auth (browser) or API key auth (server)
- Offline queue (changes sync when reconnected)
- Connection state: `disconnected` | `connecting` | `connected` | `error`

### `mindcore`

AI tools server:

- **Chat API**: Conversational AI with MindCache context
- **Tools**:
  - `read_key` / `write_key` / `delete_key` / `list_keys`
  - `generate_image` (DALL-E, etc.)
  - `analyze_image` (GPT-4 Vision)
  - `web_search`
  - `transform` (LLM template transformation)
- **Modes**:
  - `edit`: Can modify readonly keys, system prompt keys, attributes
  - `use`: Can only modify non-readonly, non-system-prompt keys

### `mindcache-server`

Cloudflare infrastructure (self-hostable):

- **Durable Objects**: 1 DO = 1 MindCache Instance
  - SQLite for key-value storage
  - WebSocket for real-time sync
  - Broadcasts changes to all connected clients
- **D1 Database**: Global data (users, projects, shares, API keys)
- **Auth**: Clerk JWT verification + API key validation
- **Webhooks**: Clerk user sync

### `mindcache-cli`

Admin CLI for self-hosters and power users:

```bash
# Setup
npx mindcache-cli init                    # Interactive setup wizard
npx mindcache-cli config set baseUrl https://your-server.com

# Projects
npx mindcache-cli projects list
npx mindcache-cli projects create "My Project"
npx mindcache-cli projects delete <project-id>

# Instances
npx mindcache-cli instances list --project <project-id>
npx mindcache-cli instances create --project <project-id> --name "main"
npx mindcache-cli instances clone <source-id> --name "backup"

# Keys (inspect/debug)
npx mindcache-cli keys list --instance <instance-id>
npx mindcache-cli keys get <key> --instance <instance-id>
npx mindcache-cli keys set <key> <value> --instance <instance-id>
npx mindcache-cli keys delete <key> --instance <instance-id>

# API Keys
npx mindcache-cli api-keys list
npx mindcache-cli api-keys create --scope instance:<id> --name "My App"
npx mindcache-cli api-keys revoke <key-id>

# Import/Export
npx mindcache-cli export --instance <id> > backup.json
npx mindcache-cli import backup.json --instance <id>
```

### `mindcache-web` (Private Repo)

Premium dashboard for managed service (`app.mindcache.dev`):

- Project/instance management with beautiful UI
- Rich key editor with real-time sync
- Sharing configuration & team management
- API key management
- Integrated chatbot (edit/use modes)
- Workflow editor & runner
- Analytics & usage tracking
- Billing & subscriptions

**This is in a separate private repository** — the managed service's competitive advantage.

---

## Self-Hosted vs Managed

| Feature | Self-Hosted | Managed |
|---------|-------------|---------|
| **Admin Interface** | CLI + REST API | ✅ Premium Dashboard |
| Projects/Instances | ✅ Full functionality | ✅ Beautiful UI |
| Keys management | CLI commands | ✅ Rich editor |
| Real-time preview | ❌ | ✅ |
| Chatbot integration | Via `mindcore` | ✅ Built-in |
| Workflows | Via `mindcore` | ✅ Visual editor |
| Analytics | ❌ | ✅ |
| Team management | API only | ✅ UI |
| Support | Community | ✅ Priority |

Self-hosters get **full functionality** via CLI/API. Managed service adds **polish + convenience**.

---

## Repository Structure

### Public Repo: `github.com/you/mindcache`

Open source monorepo with all npm packages:

```
mindcache/                        (PUBLIC REPO)
├── packages/
│   ├── mindcache/                → npm: mindcache
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── MindCache.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── index.ts
│   │   │   ├── cloud/
│   │   │   │   ├── CloudAdapter.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mindcore/                 → npm: mindcore
│   │   ├── src/
│   │   │   ├── chat.ts
│   │   │   ├── tools/
│   │   │   │   ├── read_key.ts
│   │   │   │   ├── write_key.ts
│   │   │   │   ├── generate_image.ts
│   │   │   │   └── ...
│   │   │   ├── adapters/
│   │   │   │   ├── vercel.ts
│   │   │   │   ├── cloudflare.ts
│   │   │   │   └── express.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── cli/                      → npm: mindcache-cli
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── projects.ts
│   │   │   │   ├── instances.ts
│   │   │   │   ├── keys.ts
│   │   │   │   └── api-keys.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── server/                   → Cloudflare Worker (self-hostable)
│   │   ├── src/
│   │   │   ├── worker.ts
│   │   │   ├── durable-objects/
│   │   │   ├── auth/
│   │   │   └── d1/
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── shared/                   → npm: @mindcache/shared
│       ├── src/
│       │   ├── types.ts
│       │   └── protocol.ts
│       └── package.json
│
├── examples/
│   ├── nextjs-local/             # Local-only example
│   └── nextjs-cloud/             # Cloud sync example
│
├── docs/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Private Repo: `github.com/you/mindcache-cloud`

Managed service dashboard (separate repository):

```
mindcache-cloud/                  (PRIVATE REPO)
├── src/
│   ├── app/                      # Next.js app router
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── settings/
│   │   └── api/
│   ├── components/
│   │   ├── KeyEditor/
│   │   ├── WorkflowBuilder/
│   │   ├── ChatInterface/
│   │   └── ...
│   └── lib/
│
├── package.json                  # Depends on mindcache, mindcore from npm
└── ...
```

**Key point**: The private repo imports published npm packages:

```json
{
  "dependencies": {
    "mindcache": "^3.0.0",
    "mindcore": "^1.0.0"
  }
}
```

This means you dogfood your own packages, and the dashboard is just a consumer like any other app.

---

## Performance

### Durable Object Latency

| Operation | Latency |
|-----------|---------|
| Cold DO startup | 50-200ms (rare - hibernation keeps them warm) |
| Warm DO connection | <10ms |
| `getAllKeys()` (SQLite) | <5ms |
| Key set + broadcast | <5ms |

### MindCore Connection Pool

For tools services handling multiple instances:

```typescript
// Connection pool pattern for MindCore
const instances = new Map<string, MindCache>();

async function getMindCache(instanceId: string, apiKey: string) {
  if (!instances.has(instanceId)) {
    const mc = new MindCache({
      cloud: { instanceId, apiKey }
    });
    await mc.waitForSync();  // ~100ms first time
    instances.set(instanceId, mc);
  }
  return instances.get(instanceId)!;
}

// First request to instance: ~100ms (connect + sync)
// Subsequent requests: <10ms (already connected)
```

---

## Business Model

| Layer | Open Source | Managed Service |
|-------|-------------|-----------------|
| `mindcache` | ✅ npm | — |
| `mindcore` | ✅ npm | — |
| `mindcache-server` | ✅ Self-host | ✅ api.mindcache.io |
| `mindcache-web` | ❌ (or limited) | ✅ app.mindcache.dev |

**Users can:**
- Use `mindcache` locally forever (free, no cloud)
- Self-host everything (deploy own CF worker + server)
- Use managed cloud (pay for convenience + dashboard)

---

## Migration from 2.0

### What Changes

| 2.0 | 3.0 |
|-----|-----|
| AI tools in `mindcache-server` | Extracted to `mindcore` package |
| Tight coupling to CF Worker | Tools run anywhere |
| HTTP calls to DO from chat | WebSocket via `mindcache/cloud` |

### What Stays the Same

- `mindcache` core API (100% compatible)
- `mindcache/cloud` CloudAdapter
- Durable Object architecture
- D1 for global data
- Clerk for auth

### Migration Steps

1. **For client apps**: No change needed
2. **For server tools**: Replace direct DO calls with `mindcore`

```typescript
// 2.0 (inside CF Worker)
const stub = env.MINDCACHE_INSTANCE.get(id);
await stub.fetch('/keys', { method: 'POST', body: ... });

// 3.0 (anywhere)
import { MindCore } from 'mindcore';
const core = new MindCore({ instanceId, apiKey });
await core.tools.writeKey('name', 'Alice');
```

---

## API Reference

### MindCache (Cloud)

```typescript
interface MindCacheCloudOptions {
  instanceId: string;
  tokenEndpoint?: string;  // For browser (fetches short-lived token)
  apiKey?: string;         // For server (direct auth)
  baseUrl?: string;        // Default: wss://api.mindcache.io
}

class MindCache {
  constructor(options?: { cloud?: MindCacheCloudOptions });
  
  // State
  get connectionState(): 'disconnected' | 'connecting' | 'connected' | 'error';
  get isLoaded(): boolean;
  get isCloud(): boolean;
  
  // Core API (same as local)
  set(key: string, value: unknown, attributes?: KeyAttributes): void;
  get(key: string): unknown;
  delete(key: string): void;
  getAll(): Record<string, KeyEntry>;
  subscribe(key: string, callback: (value: unknown) => void): () => void;
  subscribeToAll(callback: () => void): () => void;
  
  // Cloud-specific
  waitForSync(): Promise<void>;
  disconnect(): void;
}
```

### MindCore

```typescript
interface MindCoreOptions {
  instanceId: string;
  apiKey: string;
  openaiKey: string;
  model?: string;  // Default: 'gpt-4o'
}

class MindCore {
  constructor(options: MindCoreOptions);
  
  // Chat with MindCache context
  chat(options: {
    messages: Message[];
    mode: 'edit' | 'use';
  }): Promise<Response>;  // Streaming response
  
  // Individual tools
  tools: {
    readKey(key: string): Promise<unknown>;
    writeKey(key: string, value: unknown, attrs?: KeyAttributes): Promise<void>;
    deleteKey(key: string): Promise<void>;
    listKeys(tag?: string): Promise<KeyInfo[]>;
    generateImage(promptKey: string, outputKey: string): Promise<void>;
    analyzeImage(imageKey: string, prompt: string, outputKey: string): Promise<void>;
    webSearch(queryKey: string, outputKey: string): Promise<void>;
    transform(template: string, outputKey: string): Promise<void>;
  };
  
  // Lifecycle
  disconnect(): void;
}
```

---

## Decisions Summary

| Question | Decision |
|----------|----------|
| Package architecture | `mindcache` + `mindcore` + `mindcache-cli` (separate npm packages) |
| Tools location | Extracted to `mindcore` (runs anywhere) |
| Client-server sync | Both use `mindcache/cloud` (same API) |
| Tools service connection | WebSocket via CloudAdapter (not HTTP to DO) |
| Self-hosted admin | CLI + REST API (full functionality) |
| Dashboard hosting | Managed only (`app.mindcache.dev`) in **private repo** |
| Repository structure | Public monorepo + Private dashboard repo |

---

## Roadmap

### Phase 1: Package Extraction
- [ ] Extract AI tools from `mindcache-server` to `mindcore`
- [ ] Create `mindcore` npm package
- [ ] Add adapters (Vercel, Express, Cloudflare)
- [ ] Update examples

### Phase 2: CLI Tool
- [ ] Create `mindcache-cli` package
- [ ] Implement `init` wizard
- [ ] Implement project/instance commands
- [ ] Implement keys commands
- [ ] Implement API key commands
- [ ] Implement import/export

### Phase 3: MindCore Features
- [ ] Connection pooling for multi-instance
- [ ] Workflow execution engine
- [ ] Custom tool registration

### Phase 4: Dashboard Separation
- [ ] Create private `mindcache-cloud` repo
- [ ] Move `packages/web` to private repo
- [ ] Refactor to use npm packages as dependencies
- [ ] Add billing/subscription features
- [ ] Multi-tenant improvements

---

## Changelog

| Date | Version | Notes |
|------|---------|-------|
| 2024-12-09 | 0.2-draft | Added CLI tool, clarified two-repo structure (public + private) |
| 2024-12-09 | 0.1-draft | Initial 3.0 spec based on architecture discussion |

