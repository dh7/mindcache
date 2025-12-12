# MindCache 2.0 Specification

**Package Version**: 2.0.0  
**Spec Revision**: 2.0.0  
**Last Updated**: 2024-12-11  
**Production URL**: https://mindcache-api.dh7777777.workers.dev

## Overview

MindCache 2.0 is a **hosted, collaborative key-value store** optimized for AI agents and LLM-powered applications. It extends MindCache 1.0's core features (LLM tool generation, system prompt creation, template injection, tags) with cloud persistence, authentication, real-time sync, and granular sharing.

**Key Difference from 1.0**: While MindCache 1.0 was a client-side library where developers chose client vs server implementation, MindCache 2.0 is a managed service with cloud persistence, collaboration, and API access.

The Goal of Mindcache 2.0 is to provide a simple, easy to use, and powerful key-value store for AI agents and LLM-powered applications. It should be a drop-in replacement for Mindcache 1.0, but with the added features of cloud persistence, authentication, real-time sync, and granular sharing.

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
- ✅ Two-tier tag system: `contentTags` (user) + `systemTags` (admin)
- ✅ Template injection: `{{key}}` syntax
- ✅ Automatic LLM tool generation (`write_<key>` tools)
- ✅ System prompt generation from keys with `prompt` system tag
- ✅ Serialization (JSON, Markdown)

**Changes from 1.0**:
- Replaced boolean attributes with `systemTags` array
- Added `contentTags` for user-level organization
- Added `accessLevel` for permission control

### Tag System (1.4.0)

MindCache uses a two-tier tag system:

| Tag Type | Purpose | Access Required | Examples |
|----------|---------|-----------------|----------|
| **Content Tags** | User organization | Any (`user` or `system`) | `"persona"`, `"draft"`, `"important"` |
| **System Tags** | Behavior control | `system` access only | `"prompt"`, `"readonly"`, `"protected"`, `"template"` |

**System Tags:**
- `prompt` - Include key in system prompt (replaces `visible`)
- `readonly` - Cannot be modified by AI tools
- `protected` - Cannot be deleted (replaces `hardcoded`)
- `template` - Process value through template injection

**Access Levels:**
```typescript
// User access (default) - can only manage content tags
const mc = new MindCache();
mc.addTag('myKey', 'important');      // ✓ content tag
mc.systemAddTag('myKey', 'readonly'); // ✗ warns, returns false

// System access - can manage both content and system tags
const mcAdmin = new MindCache({ accessLevel: 'system' });
mcAdmin.addTag('myKey', 'important');      // ✓ content tag
mcAdmin.systemAddTag('myKey', 'readonly'); // ✓ system tag
```

**Legacy Compatibility:**
Legacy boolean attributes (`readonly`, `visible`, `hardcoded`, `template`) are automatically synced with `systemTags` for backward compatibility.

---

## New Features (2.0)

### 1. Cloud Persistence
- All key-value data stored in cloud database
- Automatic sync between clients
- **Offline-first with sync** (changes queue locally, sync when online)
- Conflict resolution for concurrent edits

### 2. Authentication & Authorization

#### User Authentication (OAuth)
- Clerk handles OAuth (Google, GitHub, etc.)
- JWT tokens verified in Worker
- Users own projects and instances

#### Delegate System (API Keys)
**Delegates** are API keys created by users with fine-grained permissions:

**Two-Layer Permission Model:**
1. **Key-Level Capabilities** (what the delegate CAN do):
   - `can_read`: Can read data
   - `can_write`: Can modify data
   - `can_system`: Can perform admin operations (share, delete, etc.)

2. **Resource-Level Grants** (which instances the delegate can access):
   - Grants are per-instance (Durable Object)
   - Permission levels: `read`, `write`, `system`
   - Both layers must allow the operation

**Multiple Secrets per Delegate:**
- Each delegate can have multiple secrets (for different environments)
- Secrets can be revoked individually without affecting the delegate
- Secret value shown once on creation, then only hash stored
- Secrets can be named (e.g., "Production API", "Dev Environment")

**Authentication Format:**
```
Authorization: ApiKey <delegateId>:<secret>
```

**Workflow:**
1. User creates delegate with key-level permissions
2. User creates one or more secrets for the delegate
3. User grants delegate access to specific instances
4. Delegate can authenticate and access granted instances

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

### Hybrid Architecture: DO + External Chat

**Design Decision**: Keep Durable Objects lightweight (state only), delegate AI processing to external services.

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│  Frontend   │◄──────────────────►│ Durable Object  │
│             │   (STM sync only)  │ (State manager) │
└──────┬──────┘                    └────────▲────────┘
       │                                    │
       │ POST /api/chat                     │ HTTP: GET/PUT /stm
       ▼                                    │
┌─────────────┐                             │
│  Next.js    │─────────────────────────────┘
│  API Route  │──────► OpenAI
└─────────────┘
```

**Why Hybrid?**

| Approach | Pros | Cons |
|----------|------|------|
| All-in-DO | Single connection, atomic STM ops | DO blocks on AI calls, higher billing |
| Hybrid | DO stays responsive, scales independently | Extra hop for STM, two connection types |

**Hybrid wins** because:
1. DO is single-threaded — long AI calls would block all other operations
2. DO bills per duration — AI latency increases costs
3. Separation of concerns — state vs compute
4. Frontend can use Vercel AI SDK features

**DO Responsibilities:**
- WebSocket for real-time STM sync to frontend
- HTTP endpoints: `GET /stm`, `PUT /stm` for chat route
- State management only (no AI processing)

**Chat Route Responsibilities:**
1. Fetch STM from DO via HTTP
2. Build context from STM keys
3. Call OpenAI with tools
4. Write updated STM back to DO
5. Stream response to frontend

**Next.js API Routes (minimal):**
- `/api/instances` — Bootstrap: list/create demo instances (keeps API key server-side)
- `/api/chat` — Chat proxy: fetches STM → calls AI → writes STM back

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
                              │ JWT token OR ApiKey delegateId:secret
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                                 │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Auth Worker:                                                   │  │
│  │  1. Verify Clerk JWT (using Clerk's public key) OR              │  │
│  │  2. Verify delegate (hash lookup in delegate_secrets)           │  │
│  │  3. Check two-layer permissions (key capabilities + grants)     │  │
│  │  4. Route to Durable Object                                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Delegate System Architecture

**Two-Layer Permission Model:**

1. **Key-Level Capabilities** (`delegates` table):
   - `can_read`, `can_write`, `can_system` - What the delegate CAN do
   - Set at delegate creation, cannot be changed

2. **Resource-Level Grants** (`do_permissions` table):
   - Per-instance (Durable Object) access grants
   - Permission levels: `read`, `write`, `system`
   - Can be added/removed dynamically

**Both layers must allow the operation** - prevents privilege escalation.

**Multiple Secrets per Delegate:**
- Each delegate can have multiple secrets (`delegate_secrets` table)
- Secrets can be named (e.g., "Production", "Staging")
- Secrets can be revoked individually without affecting the delegate
- Secret value shown once on creation, then only hash stored
- `last_used_at` tracked for each secret

**Permission Checking:**
```typescript
// For delegates: two-layer check
async function checkDelegatePermission(
  delegateId: string,
  doId: string,
  requiredPermission: 'read' | 'write' | 'system'
): Promise<boolean> {
  // Layer 1: Check key-level capabilities
  const delegate = await db.prepare(`
    SELECT can_read, can_write, can_system FROM delegates WHERE delegate_id = ?
  `).bind(delegateId).first();
  
  if (!delegate) return false;
  
  const hasKeyPermission = (
    (requiredPermission === 'read' && delegate.can_read) ||
    (requiredPermission === 'write' && delegate.can_write) ||
    (requiredPermission === 'system' && delegate.can_system)
  );
  
  if (!hasKeyPermission) return false;
  
  // Layer 2: Check resource-level grant
  const grant = await db.prepare(`
    SELECT permission FROM do_permissions 
    WHERE do_id = ? AND actor_id = ? AND actor_type = 'delegate'
  `).bind(doId, delegateId).first();
  
  if (!grant) return false;
  
  // Check permission hierarchy (system > write > read)
  const hierarchy = { read: 1, write: 2, system: 3 };
  return hierarchy[grant.permission] >= hierarchy[requiredPermission];
}
```

**API Endpoints:**

- `POST /api/delegates` - Create delegate (returns delegate_id, no secret yet)
- `GET /api/delegates` - List user's delegates
- `DELETE /api/delegates/:id` - Delete delegate (cascades to secrets)
- `POST /api/delegates/:id/secrets` - Create secret (returns secret once)
- `GET /api/delegates/:id/secrets` - List secrets (no secret values)
- `DELETE /api/delegates/:id/secrets/:secretId` - Revoke secret
- `POST /api/delegates/:id/grants` - Grant access to instance
- `GET /api/delegates/:id/grants` - List grants
- `DELETE /api/delegates/:id/grants/:instanceId` - Revoke access

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
| **Auth (apps)** | Delegates | Multiple secrets per delegate, hashed in D1, verified in Worker |
| **Global Data** | Cloudflare D1 | Users, projects, shares, delegates, delegate_secrets, do_ownership, do_permissions |
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

-- Delegates (API Keys) with key-level permissions
delegates (
  delegate_id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1,
  can_write INTEGER NOT NULL DEFAULT 0,
  can_system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER
)

-- Delegate Secrets (multiple secrets per delegate)
delegate_secrets (
  secret_id TEXT PRIMARY KEY,
  delegate_id TEXT NOT NULL REFERENCES delegates(delegate_id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  name TEXT,  -- Optional name (e.g., "Production API", "Dev Environment")
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  revoked_at INTEGER,  -- NULL = active, timestamp = revoked
  created_by_user_id TEXT NOT NULL REFERENCES users(id)
)

-- DO Ownership - tracks which user owns which Durable Object
do_ownership (
  do_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)

-- DO Permissions - resource-level permissions for users and delegates
do_permissions (
  do_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'delegate')),
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'system')),
  granted_by_user_id TEXT NOT NULL REFERENCES users(id),
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  PRIMARY KEY (do_id, actor_id, permission)
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
3. User creates delegate "Scraper Bot" with can_read=true, can_write=true
4. User creates secret for delegate (shown once, then stored as hash)
5. User grants delegate "read" and "write" access to "tweets" instance
6. User gives delegate credentials (delegateId:secret) to scraper app
7. Scraper app authenticates and writes tweets to "tweets" instance
8. User shares "tweets" instance with group (including agents)
9. Agents subscribe to key updates
10. When new tweet arrives, agents are notified and process it
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
| API key scope? | **Grant-based per-instance** (delegates with two-layer permissions) |
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
│   │   │   │   ├── types.ts          # Cloud types
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
├── examples/                         # STANDALONE (not part of pnpm workspace!)
│   ├── nextjs_client_demo/           # 1.0 style (client STM, no cloud)
│   └── nextjs_cloud_demo/            # 2.0 with cloud sync
│   # Run `npm install` inside each example - they're independent
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

### Built-in Cloud Sync

Cloud sync is built directly into the `MindCache` constructor - no hooks or adapters needed:

```typescript
interface MindCacheCloudOptions {
  instanceId: string;        // Instance to connect to
  projectId?: string;        // Project ID (defaults to 'default')
  tokenEndpoint?: string;    // API endpoint to fetch WS token (recommended for browser)
  apiKey?: string;           // Direct API key (server-only, never expose in browser!)
  baseUrl?: string;          // WebSocket URL (defaults to production)
}

interface MindCacheOptions {
  cloud?: MindCacheCloudOptions;
}
```

#### Local Mode (unchanged from 1.0)

```typescript
const mc = new MindCache();
mc.set_value('name', 'Alice');
mc.subscribeToAll(() => console.log('changed!'));
```

#### Cloud Mode (same API!)

```typescript
const mc = new MindCache({
  cloud: {
    instanceId: 'my-instance-id',
    tokenEndpoint: '/api/ws-token',
  }
});

// Same API as local!
mc.subscribeToAll(() => console.log('synced!'));

// Additional properties for cloud
console.log(mc.connectionState); // 'disconnected' | 'connecting' | 'connected' | 'error'
console.log(mc.isLoaded);        // true when initial sync complete
console.log(mc.isCloud);         // true
```

The MindCache instance handles:
- CloudAdapter lifecycle automatically
- Token fetching via endpoint
- Connection state management
- Reconnection with exponential backoff
- Cleanup via `mc.disconnect()`

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
11. ~~Phase 2~~ ✅:
    - ~~Share API endpoints~~ ✅
    - ~~API Key management~~ ✅
    - ~~Share modal UI~~ ✅
    - ~~API Keys page~~ ✅
    - ~~Share permission checking~~ ✅
    - ~~Project/Instance selector~~ ✅
12. ~~Phase 3~~ ✅:
    - ~~Chat API with MindCache tools~~ ✅ (`/api/chat`)
    - ~~Transform API~~ ✅ (`/api/transform`)
    - ~~Generate Image API~~ ✅ (`/api/generate-image`)
    - ~~Analyze Image API~~ ✅ (`/api/analyze-image`)
13. ~~Phase 4: Delegate System~~ ✅:
    - ~~Two-layer permission model~~ ✅ (key-level capabilities + resource-level grants)
    - ~~Multiple secrets per delegate~~ ✅ (can revoke individual secrets)
    - ~~Delegate management endpoints~~ ✅ (`/api/delegates`, `/api/delegates/:id/secrets`)
    - ~~Grant management endpoints~~ ✅ (`/api/delegates/:id/grants`)
    - ~~Permission checking logic~~ ✅ (`checkDelegatePermission`, `checkUserPermission`)
    - ~~DO ownership tracking~~ ✅ (`do_ownership` table)
    - ~~UI for delegate management~~ ✅ (create delegates, manage secrets, grant access)
14. **Future Phases**:
    - Phase 4: Workflows + Webhooks
    - Phase 5: Offline queue
    - Deploy to production

---

## Deployment

### Database Migrations

Migrations are managed via `wrangler d1 migrations`:

**Local Development:**
```bash
cd packages/server
pnpm db:migrate:local
```

**Production:**
```bash
cd packages/server
pnpm db:migrate  # Applies pending migrations to production
```

**Check Migration Status:**
```bash
pnpm db:migrations:list        # Production
pnpm db:migrations:list:local  # Local
```

**Deploy Script:**
```bash
cd packages/server
./deploy.sh  # Checks migrations, applies if needed, deploys worker
```

### Migration Files

- `0001_initial.sql` - Initial schema (users, projects, instances)
- `0002_ws_tokens.sql` - WebSocket token management
- `0003_delegates_and_permissions.sql` - Delegates, do_ownership, do_permissions tables
- `0004_delegate_secrets.sql` - Multiple secrets per delegate

---

## Changelog

| Date | Version | Notes |
|------|---------|-------|
| 2024-12-11 | 2.0.0 | **Delegate System Complete!** Two-layer permissions, multiple secrets per delegate, grant-based access control |
| 2024-12-11 | 1.4.0-alpha | Two-tier tag system: `contentTags` (user) + `systemTags` (admin) with access level control |
| 2024-12-08 | 1.3.1-alpha | Clarified examples/ are standalone (not part of pnpm workspace) - run `npm install` inside each |
| 2024-12-06 | 1.3-alpha | Built-in cloud sync via `MindCache({ cloud: {...} })` constructor - same DX as local |
| 2024-12-05 | 1.2-alpha | Added Hybrid Architecture (DO for state, external chat). Simplified Next.js routes to `/api/instances` + `/api/chat` only |
| 2024-12-04 | 1.1-alpha | ✅ **Phase 3 Complete!** Chat API + LLM Tools (transform, generate-image, analyze-image) |
| 2024-11-30 | 1.0-alpha | 🚀 **Deployed to production!** API live at workers.dev |
| 2024-11-30 | 0.9 | Phase 1 partial: Instance editor UI with real-time WebSocket sync |
| 2024-11-30 | 0.8 | Added Clerk JWT verification, API key auth, and webhook handlers to server |
| 2024-11-30 | 0.7 | Implemented monorepo structure, refactored core, created cloud adapter, server (DO), and web scaffolds |
| 2024-11-30 | 0.6 | Finalized: DO + D1 + Clerk. Removed comparison options. |
| 2024-11-30 | 0.5 | Added Clerk for auth, simplified tech comparison |
| 2024-11-30 | 0.4 | Added repository architecture (Core + Subpath exports pattern) |
| 2024-11-30 | 0.3 | Tech stack decision: Durable Objects, deprioritized self-hosting |
| 2024-11-29 | 0.2 | Incorporated answers, renamed Session→MindCache Instance, clarified sharing |
| 2024-11-29 | 0.1 | Initial specification |
