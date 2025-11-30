# MindCache 2.0 Specification

**Version**: 0.9  
**Last Updated**: 2024-11-30

## Overview

MindCache 2.0 is a **hosted, collaborative key-value store** optimized for AI agents and LLM-powered applications. It extends MindCache 1.0's core features (LLM tool generation, system prompt creation, template injection, tags) with cloud persistence, authentication, real-time sync, and granular sharing.

**Key Difference from 1.0**: While MindCache 1.0 was a client-side library where developers chose client vs server implementation, MindCache 2.0 is a managed service with cloud persistence, collaboration, and API access.

---

## Core Concepts

### 1. Entities Hierarchy

```
Admin User (human)
 └── Project (container for mindcache instances)
      └── MindCache Instance (formerly "Session")
           └── Key-Value entries (with attributes & tags)
```

### 2. Terminology

| Term | Definition |
|------|------------|
| **Admin User** | Authenticated identity (human via OAuth) |
| **User** | Authenticated identity (human via OAuth, or app/agent via API key) |
| **Project** | A container that groups related MindCache Instances. Owned by one Admin user. |
| **MindCache Instance** | A self-contained key-value store. Can be cloned from another instance. |
| **Key** | A named entry with value + attributes (readonly, hardcoded, tags, type) |

### 3. User Types

| Type | Auth Method | Description |
|------|-------------|-------------|
| Human | OAuth (Google, GitHub, etc.) | Interactive users via web UI |
| App | API Key | External applications (e.g., tweet scraper) |
| Agent | API Key | Autonomous AI agents |

**Important**: Apps and agents do NOT own projects. A human user creates the project and grants apps/agents access via API keys.

### 4. MindCache Instance Model

MindCache Instances are **fully dynamic** — they can have any keys, not bound to a schema.

- Instances can be **cloned** from another instance (fork model)
- Instances can be marked as **read-only** (for snapshots/templates)
- Each user gets their own instance when accessing a project (user-scoped)
- Users can reuse existing instances or create new ones

```
Project: "Link Bookmarks"
 ├── MindCache Instance: "template" (read-only, owned by project owner)
 ├── MindCache Instance: "alice-links" (cloned from template)
 ├── MindCache Instance: "bob-links" (cloned from template)
 └── MindCache Instance: "shared-team-links" (shared with group)
```

### 5. Sharing Model

Sharing happens at two levels:

| Level | Access Granted | Use Case |
|-------|----------------|----------|
| **Project** | Admin access to all instances | Team admin, debugging |
| **MindCache Instance** | Read/write to specific instance | Collaboration, sharing content |

**Note**: Key-level sharing is achieved by creating an instance with only the keys you want to share.

**Permissions**: `read`, `write`, `admin`

**Share Targets**:
- Specific users (by email or user ID)
- Groups (containing users, apps, and agents)
- API tokens (for external access)
- Public (anyone with link)

---

## Core Features (inherited from 1.0)

- ✅ Key-value storage with types: `text`, `json`, `image`, `file`
- ✅ Attributes: `readonly`, `visible`, `hardcoded`, `tags`
- ✅ Template injection: `{{key}}` syntax
- ✅ Automatic LLM tool generation (`write_<key>` tools)
- ✅ System prompt generation from keys tagged with `SystemPrompt`
- ✅ Serialization (JSON, Markdown)

**Changes from 1.0**:
- Removed `template` attribute (simplified)
- System prompt now uses `SystemPrompt` tag instead of `visible` attribute

---

## New Features (2.0)

### 1. Cloud Persistence
- All key-value data stored in cloud database
- Automatic sync between clients
- **Offline-first with sync** (changes queue locally, sync when online)
- Conflict resolution for concurrent edits

### 2. Authentication & Authorization
- OAuth login (Google, GitHub, etc.)
- API key generation for apps/agents
- API keys can be scoped to:
  - Entire user account
  - Specific project(s)
  - Specific MindCache instance(s)
- Role-based access control

### 3. Real-Time Updates
- WebSocket/SSE for live key changes
- Subscribe to specific keys or entire instances
- Webhooks for external integrations
- **Scope**: Only instance subscribers get notified (not project-level)

### 4. Versioning & History
- Clone an instance to create a snapshot
- Users can go back in time by browsing/restoring snapshots
- No automatic version tracking per key (use cloning instead)

### 5. API Layer

#### Chat API
Powers a chatbot that:
- Uses MindCache keys tagged `SystemPrompt` for context
- Has tools to read/write keys
- Two modes:
  - **Edit mode**: Can create/delete keys, modify tags, add new keys, can edit readonly keys and update attributes.
  - **Use mode**: Can create/delete keys, add new keys, can't edit system prompt keys. can't edit readonly keys.

#### Action APIs
Pre-built endpoints that read from and write to MindCache:

| API | Input | Output |
|-----|-------|--------|
| `/api/chat` | prompt, instance_id | AI response (writes to keys) |
| `/api/generate-image` | prompt_key, output_key | Generates image, saves to output_key |
| `/api/web-search` | query_key, output_key | Searches web, saves results |
| `/api/transform` | template, output_key | LLM transforms template to output |
| `/api/analyze-image` | image_key, prompt, output_key | Analyzes image, saves result |

All APIs:
- Read context from MindCache keys
- Write results to specified output keys
- Can be chained to create workflows

### 6. Workflows

Workflows are **markdown-formatted step lists** that can be:
- Executed by the chatbot (client-side orchestration)
- Executed by the backend (using Temporal or similar)
- Stored in MindCache as a key tagged `Workflow`

**Format**:
```markdown
1. Search for {{topic}} using web search 
  {{ topic }} will be replaced with the value of the key "topic"
2. Summarize the results into ->@summary
  value will be stored in the key "summary"
3. Generate an image based on @summary
  @summary is in the context windows, so the chatbot will be able to use it.
4. Store the image in ->@result_image
```

**Execution**:
- Steps are parsed and executed sequentially
- Template injection (`{{key}}`) resolves values before each step
- Each step maps to an API call or chatbot prompt and use the ->@key syntax to know where the output will be stored.

### 7. Online Editor
Web UI for:
- Creating/editing projects and MindCache instances
- Managing keys with tags
- Integrated chatbot (edit/use modes)
- Sharing configuration
- API key management
- Workflow editor and runner

### 8. Export & Import
- Full project export (all instances, keys, metadata)
- Markdown export (compatible with 1.0)
- JSON export
- Import from local MindCache 1.0 instances

---

## Architecture & Tech Stack

### Core Decision: Durable Objects for Real-Time

**Cloudflare Durable Objects** are the foundation for MindCache 2.0:
- ✅ 1 MindCache Instance = 1 Durable Object (natural mapping)
- ✅ SQLite per DO for complex key queries
- ✅ Native WebSocket (best real-time)
- ✅ Strong consistency (single-threaded, no conflicts)
- ✅ Edge-deployed (low latency globally)

---

### Authentication: Clerk

Using **Clerk** for authentication (standard auth provider):

| Auth Type | Solution |
|-----------|----------|
| **Human users** | Clerk — handles OAuth (Google, GitHub), sessions, UI |
| **Apps/Agents** | API Keys — stored in database, hashed |

**Why Clerk**:
- ✅ Great Next.js integration (for web UI)
- ✅ Works with Cloudflare Workers (JWT verification)
- ✅ OAuth providers built-in (Google, GitHub, etc.)
- ✅ User management UI included
- ✅ Generous free tier (10K MAU)

**Auth Flow**:
```
┌──────────────────────────────────────────────────────────────────────┐
│                         Web UI (Vercel)                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Clerk handles:                                                 │  │
│  │  - Login UI (Google, GitHub, email)                            │  │
│  │  - Session management                                          │  │
│  │  - User profiles                                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ JWT token in header
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                                 │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Auth Worker:                                                   │  │
│  │  1. Verify Clerk JWT (using Clerk's public key)                │  │
│  │  2. OR verify API key (hash lookup in DB)                      │  │
│  │  3. Check permissions                                          │  │
│  │  4. Route to Durable Object                                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Global Database: Cloudflare D1

**Cloudflare D1** for global data (users, projects, shares, API keys):
- ✅ All on Cloudflare (simple architecture)
- ✅ Edge-deployed everywhere (low latency)
- ✅ Single billing
- ✅ SQLite syntax (portable if needed later)

---

### Full Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Web UI (Vercel + Clerk)                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Clerk handles:                                                 │  │
│  │  - Login UI (Google, GitHub, email)                            │  │
│  │  - Session management                                          │  │
│  │  - User profiles                                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ JWT token in header
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                                 │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Auth Worker:                                                   │  │
│  │  1. Verify Clerk JWT (using Clerk's public key)                │  │
│  │  2. OR verify API key (hash lookup in D1)                      │  │
│  │  3. Check permissions in D1                                    │  │
│  │  4. Route to correct Durable Object                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────────┐
│    Cloudflare D1    │    │      Durable Objects            │
│  (Global SQLite)    │    │                                 │
│  ┌───────────────┐  │    │  ┌─────────────────────────┐   │
│  │ users (sync   │  │    │  │ DO: instance-abc123     │   │
│  │   from Clerk) │  │    │  │ - SQLite (keys, values) │   │
│  │ projects      │  │    │  │ - WebSocket connections │   │
│  │ shares        │  │    │  │ - Real-time broadcast   │   │
│  │ api_keys      │  │    │  └─────────────────────────┘   │
│  │ groups        │  │    │  ┌─────────────────────────┐   │
│  │ webhooks      │  │    │  │ DO: instance-def456     │   │
│  │ usage_logs    │  │    │  │ - SQLite (keys, values) │   │
│  └───────────────┘  │    │  │ - WebSocket connections │   │
└─────────────────────┘    │  └─────────────────────────┘   │
                           └─────────────────────────────────┘
```

### Tech Stack Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Web UI** | Vercel + Next.js | Dashboard, editor, chatbot |
| **Auth (humans)** | Clerk | OAuth, sessions, user management |
| **Auth (apps)** | API Keys | Hashed in D1, verified in Worker |
| **Global Data** | Cloudflare D1 | Users, projects, shares, API keys |
| **Instance Data** | Durable Objects | Keys, values, WebSocket, real-time |
| **Real-time** | DO WebSocket | Native, best-in-class |

---

## Data Model

```sql
-- Users (synced from Clerk via webhooks)
users (
  id UUID PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at TIMESTAMP
)

-- Projects
projects (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id),
  name TEXT,
  description TEXT,
  created_at TIMESTAMP
)

-- MindCache Instances (formerly sessions)
mindcache_instances (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  owner_id UUID REFERENCES users(id),
  name TEXT,
  parent_instance_id UUID REFERENCES mindcache_instances(id), -- for cloning
  is_readonly BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Key-Value entries (per instance)
keys (
  id UUID PRIMARY KEY,
  instance_id UUID REFERENCES mindcache_instances(id),
  name TEXT,
  value TEXT, -- JSON-encoded for all types
  type TEXT CHECK (type IN ('text', 'json', 'image', 'file')),
  content_type TEXT, -- MIME type for image/file
  readonly BOOLEAN DEFAULT FALSE,
  hardcoded BOOLEAN DEFAULT FALSE,
  tags TEXT[], -- array of tags
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(instance_id, name)
)

-- Sharing
shares (
  id UUID PRIMARY KEY,
  resource_type TEXT CHECK (resource_type IN ('project', 'instance')),
  resource_id UUID,
  target_type TEXT CHECK (target_type IN ('user', 'group', 'api_key', 'public')),
  target_id UUID, -- NULL for public
  permission TEXT CHECK (permission IN ('read', 'write', 'admin')),
  created_at TIMESTAMP
)

-- Groups
groups (
  id UUID PRIMARY KEY,
  name TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP
)

group_members (
  group_id UUID REFERENCES groups(id),
  user_id UUID REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
)

-- API Keys
api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT,
  key_hash TEXT, -- hashed API key
  scope_type TEXT CHECK (scope_type IN ('account', 'project', 'instance')),
  scope_id UUID, -- NULL for account scope
  permissions TEXT[], -- ['read', 'write']
  created_at TIMESTAMP,
  last_used_at TIMESTAMP
)

-- Webhooks
webhooks (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  instance_id UUID REFERENCES mindcache_instances(id),
  url TEXT,
  events TEXT[], -- ['key.created', 'key.updated', 'key.deleted']
  secret TEXT,
  created_at TIMESTAMP
)

-- Usage tracking (for billing)
usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  api_key_id UUID REFERENCES api_keys(id),
  endpoint TEXT,
  instance_id UUID,
  created_at TIMESTAMP
)
```

---

## Use Cases

### Use Case 1: Tweet Scraper
```
1. Human user creates project "Tweet Monitor"
2. User creates MindCache instance "tweets"
3. User generates API key scoped to "tweets" instance
4. User gives API key to scraper app
5. Scraper app writes tweets to "tweets" instance
6. User shares "tweets" instance with group (including agents)
7. Agents subscribe to key updates
8. When new tweet arrives, agents are notified and process it
```

### Use Case 2: Link Bookmarking with Partial Sharing
```
1. User creates project "My Links"
2. User creates MindCache instance "all-links"
3. User saves links with tags: "private", "public", "work"
4. User creates new instance "public-links" with only public links
5. User shares "public-links" instance with friends
6. Friends see shared instance (not the full project)
```

### Use Case 3: Form + Agent Workflow
```
1. User and Agent share same MindCache instance
2. User updates form (writes to keys)
3. Agent is subscribed to instance (real-time WebSocket)
4. Agent receives notification of key change
5. Agent processes and writes result to another key
6. User sees update in real-time
```

---

## Decisions Summary

| Question | Decision |
|----------|----------|
| What is a session? | **MindCache Instance** — a fork-able, clonable key-value store |
| Are keys schema-defined? | **No** — instances can have any keys dynamically |
| Who gets notified on updates? | **Instance subscribers only** |
| Conflict resolution? | **Durable Objects** — single-threaded, no conflicts within instance |
| API key scope? | **Account, Project, or Instance level** |
| Key-level sharing? | **No** — create instance with subset of keys instead |
| Workflows? | **Markdown format**, client + backend execution |
| Offline support? | **Phase 2** — client-side queue, sync when connected |
| Self-hosting? | **Deprioritized** — focus on hosted service first |
| Real-time layer? | **Durable Objects** — 1 DO = 1 MindCache Instance |
| Global database? | **Cloudflare D1** — all Cloudflare, edge-deployed |
| Authentication? | **Clerk** — handles OAuth, sessions, user management |
| Package architecture? | **Core + Subpath exports** — `mindcache` + `mindcache/cloud` |

---

## Repository Architecture

### Package Strategy: Core + Subpath Exports

Single `mindcache` npm package with optional cloud adapter via subpath export.

```typescript
// 1.0 behavior (unchanged, small bundle)
import { MindCache } from 'mindcache';
const mc = new MindCache();
mc.set_value('name', 'Alice');

// 2.0 behavior (adds cloud sync)
import { MindCache } from 'mindcache';
import { connectCloud } from 'mindcache/cloud';

const mc = new MindCache();
connectCloud(mc, {
  projectId: 'my-project',
  instanceId: 'main',
  apiKey: 'mc_live_xxxxx'
});

// OR: Factory function
import { createCloudMindCache } from 'mindcache/cloud';
const mc = createCloudMindCache({
  projectId: 'my-project',
  instanceId: 'main',
  apiKey: 'mc_live_xxxxx'
});

// Same API for both!
mc.set_value('name', 'Alice');
const tools = mc.get_aisdk_tools();
const prompt = mc.get_system_prompt();
```

**Benefits**:
- ✅ Same package, optional cloud features
- ✅ Tree-shakeable (small bundle if no cloud)
- ✅ 1.0 users completely unaffected
- ✅ Modern pattern (like `ai`, `@tanstack/query`)

---

### Monorepo Structure

```
mindcache/
├── packages/
│   │
│   ├── mindcache/                    # npm package (client SDK)
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── MindCache.ts      # Core class (1.0 logic)
│   │   │   │   ├── types.ts
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── cloud/                # Cloud sync layer (2.0)
│   │   │   │   ├── CloudAdapter.ts   # WebSocket + HTTP sync
│   │   │   │   ├── auth.ts           # API key handling
│   │   │   │   ├── connectCloud.ts   # Main export
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   └── index.ts              # Main export (core only)
│   │   │
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── server/                       # Cloudflare Workers + Durable Objects
│   │   ├── src/
│   │   │   ├── worker.ts             # Main Worker (auth, routing)
│   │   │   ├── durable-objects/
│   │   │   │   └── MindCacheInstance.ts  # One DO per instance
│   │   │   └── d1/
│   │   │       └── schema.sql        # Users, projects, shares
│   │   │
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   ├── web/                          # Web UI (dashboard, editor)
│   │   ├── src/
│   │   │   ├── app/                  # Next.js or Astro
│   │   │   └── components/
│   │   │
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── shared/                       # Shared types & protocol
│       ├── src/
│       │   ├── types.ts              # KeyAttributes, etc.
│       │   └── protocol.ts           # WebSocket message types
│       └── package.json
│
├── examples/
│   ├── local-only/                   # 1.0 style (no cloud)
│   └── cloud-sync/                   # 2.0 with cloud
│
├── docs/
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml
└── package.json
```

---

### Package.json Exports

```json
{
  "name": "mindcache",
  "version": "2.0.0",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./cloud": {
      "import": "./dist/cloud/index.mjs",
      "require": "./dist/cloud/index.cjs",
      "types": "./dist/cloud/index.d.ts"
    }
  },
  "peerDependencies": {
    "ai": ">=3.0.0"
  },
  "peerDependenciesMeta": {
    "ai": { "optional": true }
  }
}
```

---

### Cloud Adapter Implementation

```typescript
// packages/mindcache/src/cloud/CloudAdapter.ts
export class CloudAdapter {
  private ws: WebSocket | null = null;
  private queue: Operation[] = [];
  private mindcache: MindCache;
  
  constructor(
    private config: { projectId: string; instanceId: string; apiKey: string }
  ) {}
  
  attach(mc: MindCache) {
    this.mindcache = mc;
    
    // Subscribe to local changes → push to cloud
    mc.subscribeToAll(() => {
      // Debounce and push changes
    });
  }
  
  connect() {
    const url = `wss://api.mindcache.io/sync/${this.config.instanceId}`;
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: 'auth', apiKey: this.config.apiKey }));
      this.flushQueue();
    };
    
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'set') {
        // Update local state without triggering sync loop
        this.mindcache._setFromRemote(msg.key, msg.value, msg.attrs);
      }
    };
  }
  
  push(op: Operation) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(op));
    } else {
      this.queue.push(op); // Queue for offline
    }
  }
  
  private flushQueue() {
    while (this.queue.length > 0) {
      const op = this.queue.shift()!;
      this.ws?.send(JSON.stringify(op));
    }
  }
}

// packages/mindcache/src/cloud/index.ts
export function connectCloud(
  mc: MindCache,
  config: { projectId: string; instanceId: string; apiKey: string }
): CloudAdapter {
  const adapter = new CloudAdapter(config);
  adapter.attach(mc);
  adapter.connect();
  return adapter;
}

export function createCloudMindCache(
  config: { projectId: string; instanceId: string; apiKey: string }
): MindCache {
  const mc = new MindCache();
  connectCloud(mc, config);
  return mc;
}
```

---

### Migration Path

#### For 1.0 Users (no change)

```typescript
// Works exactly as before
import { MindCache } from 'mindcache';
const mc = new MindCache();
mc.set_value('name', 'Alice');
```

#### Migrating to 2.0

1. **Create project** at `mindcache.io`
2. **Create instance**, get API key
3. **Add cloud connection**:

```typescript
import { MindCache } from 'mindcache';
import { connectCloud } from 'mindcache/cloud';

const mc = new MindCache();
connectCloud(mc, {
  projectId: 'my-project',
  instanceId: 'main',
  apiKey: 'mc_live_xxxxx'
});

// Everything else unchanged!
mc.set_value('name', 'Alice');
const tools = mc.get_aisdk_tools();
```

4. **(Optional) Import existing data**:

```typescript
// Export from local
const data = localMc.serialize();

// Import to cloud instance
cloudMc.deserialize(data);
```

---

## Billing Model

- Charge per **API call** (not per instance or storage)
- Track usage via `usage_logs` table
- Free tier with limits
- Paid tiers for higher volume

---

## Next Steps

1. ~~Align on open questions~~ ✅
2. ~~Choose tech stack~~ ✅ (Durable Objects + D1 + Clerk)
3. ~~Define package architecture~~ ✅ (Core + Subpath exports)
4. ~~Set up monorepo~~ ✅ (Turborepo + pnpm)
5. ~~Refactor mindcache 1.0~~ ✅ → `packages/mindcache/src/core/`
6. ~~Create cloud adapter~~ ✅ → `packages/mindcache/src/cloud/`
7. ~~Create server scaffold~~ ✅ → `packages/server/` (Cloudflare Worker + DO)
8. ~~Create web scaffold~~ ✅ → `packages/web/` (Next.js + Clerk)
9. ~~Add Clerk auth to server~~ ✅ → JWT verification + webhook handlers
10. ~~Phase 1 (partial)~~ ✅:
    - ~~Project CRUD API~~ ✅
    - ~~Instance CRUD API~~ ✅
    - ~~WebSocket real-time sync (DO)~~ ✅ (with tests)
    - ~~Instance editor UI~~ ✅ (add/edit/delete keys)
11. **Next: Phase 1 completion**:
    - Deploy to Cloudflare (D1 + Worker)
    - Integrate CloudAdapter in web app for seamless sync
12. **Future Phases**:
    - Phase 2: Sharing + permissions
    - Phase 3: Chat API + Tools
    - Phase 4: Workflows + Webhooks
    - Phase 5: Offline queue

---

## Changelog

| Date | Version | Notes |
|------|---------|-------|
| 2024-11-30 | 0.9 | Phase 1 partial: Instance editor UI with real-time WebSocket sync |
| 2024-11-30 | 0.8 | Added Clerk JWT verification, API key auth, and webhook handlers to server |
| 2024-11-30 | 0.7 | Implemented monorepo structure, refactored core, created cloud adapter, server (DO), and web scaffolds |
| 2024-11-30 | 0.6 | Finalized: DO + D1 + Clerk. Removed comparison options. |
| 2024-11-30 | 0.5 | Added Clerk for auth, simplified tech comparison |
| 2024-11-30 | 0.4 | Added repository architecture (Core + Subpath exports pattern) |
| 2024-11-30 | 0.3 | Tech stack decision: Durable Objects, deprioritized self-hosting |
| 2024-11-29 | 0.2 | Incorporated answers, renamed Session→MindCache Instance, clarified sharing |
| 2024-11-29 | 0.1 | Initial specification |
