# MindCache 2.0 Specification

**Version**: 0.2  
**Last Updated**: 2024-11-29

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
- Import to migrate between platforms or for self-hosting

### 9. Self-Hosting
MindCache 2.0 will be deployable on user's own infrastructure.

---

## Architecture

### Proposed Stack

| Component | Technology | Reason |
|-----------|------------|--------|
| **Hosting** | Vercel | Edge functions, easy deployment |
| **Database** | Supabase (Postgres) | SQL, Row-level security, familiar |
| **Auth** | Supabase Auth | Google, GitHub, API keys built-in |
| **Real-time** | Supabase Realtime | Native Postgres integration |
| **Workflows** | Temporal (optional) | Durable execution for backend workflows |
| **Offline Sync** | TBD | Need to evaluate options |

### Alternative: Durable Objects
For real-time collaboration and conflict resolution, Cloudflare Durable Objects could be considered:
- Per-instance WebSocket connections
- Built-in conflict resolution
- Edge-first architecture

---

## Data Model

```sql
-- Users (managed by Supabase Auth)
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

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| What is a session? | **MindCache Instance** — a fork-able, clonable key-value store |
| Are keys schema-defined? | **No** — instances can have any keys dynamically |
| Who gets notified on updates? | **Instance subscribers only** |
| Conflict resolution? | **TBD** — evaluate Durable Objects or CRDT |
| API key scope? | **Account, Project, or Instance level** |
| Key-level sharing? | **No** — create instance with subset of keys instead |
| Workflows? | **Markdown format**, client + backend execution |
| Offline support? | **Yes** — offline-first with sync |
| Self-hosting? | **Yes** — exportable and self-deployable |

---

## Billing Model

- Charge per **API call** (not per instance or storage)
- Track usage via `usage_logs` table
- Free tier with limits
- Paid tiers for higher volume

---

## Next Steps

1. ~~Align on open questions~~ ✅
2. Define MVP scope (which features first?)
3. Set up Supabase project
4. Design API contracts (OpenAPI spec)
5. Build incrementally:
   - Phase 1: Auth + basic CRUD
   - Phase 2: Sharing + Real-time
   - Phase 3: Chat API + Tools
   - Phase 4: Workflows + Webhooks
   - Phase 5: Offline sync + Self-hosting

---

## Changelog

| Date | Version | Notes |
|------|---------|-------|
| 2024-11-29 | 0.2 | Incorporated answers, renamed Session→MindCache Instance, clarified sharing |
| 2024-11-29 | 0.1 | Initial specification |
