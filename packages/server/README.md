# @mindcache/server

Cloudflare Workers backend for MindCache 2.0 — a real-time key-value store with AI capabilities.

## Overview

This package provides the cloud infrastructure for MindCache:

- **Cloudflare Workers** — Edge-deployed API handling auth, routing, and REST endpoints
- **Durable Objects** — Per-instance key-value storage with real-time WebSocket sync
- **D1 Database** — Global relational data (users, projects, shares, API keys)
- **Clerk** — Authentication via JWT and webhooks for user sync
- **AI APIs** — Chat, text transforms, and image generation/analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Cloudflare Workers                                │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Worker (worker.ts)                            │   │
│  │                                                                       │   │
│  │  • CORS handling                                                      │   │
│  │  • Authentication (Clerk JWT / API keys)                              │   │
│  │  • Request routing                                                    │   │
│  │  • REST API endpoints                                                 │   │
│  └────────────┬─────────────────────┬────────────────────┬──────────────┘   │
│               │                     │                    │                   │
│               ▼                     ▼                    ▼                   │
│  ┌────────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │   D1 Database      │  │  Durable Objects │  │      AI Module          │  │
│  │                    │  │                  │  │                         │  │
│  │  • users           │  │  MindCacheInst-  │  │  • /api/chat            │  │
│  │  • projects        │  │  anceDO          │  │  • /api/transform       │  │
│  │  • instances       │  │                  │  │  • /api/generate-image  │  │
│  │  • shares          │  │  Per-instance:   │  │  • /api/analyze-image   │  │
│  │  • api_keys        │  │  • SQLite KV     │  │                         │  │
│  │  • webhooks        │  │  • WebSocket hub │  │  Providers:             │  │
│  │  • groups          │  │  • Broadcasting  │  │  • OpenAI (GPT-4o)      │  │
│  │  • usage_logs      │  │                  │  │  • Fireworks (Flux)     │  │
│  │  • ws_tokens       │  │                  │  │                         │  │
│  └────────────────────┘  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Worker (`src/worker.ts`)

Main entry point handling:

- **Health check** — `GET /health`
- **WebSocket upgrade** — `GET /sync/:instanceId` (upgrades to WS)
- **Clerk webhooks** — `POST /webhooks/clerk`
- **Admin introspection** — `GET /admin/do/:objectId`
- **REST API** — `GET|POST|PUT|PATCH|DELETE /api/*`

Authentication flow:
1. Extract token from `Authorization: Bearer <token>` header
2. If JWT format → verify with Clerk
3. If `mc_live_*` format → verify API key hash in D1
4. Dev mode allows unauthenticated access

### 2. Durable Object (`src/durable-objects/MindCacheInstance.ts`)

Each MindCache instance maps to one Durable Object providing:

**Storage (SQLite)**
```sql
CREATE TABLE keys (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,        -- JSON-encoded
  type TEXT NOT NULL,         -- 'text' | 'json' | 'image' | 'markdown'
  content_type TEXT,          -- MIME type for images
  readonly INTEGER,
  visible INTEGER,
  hardcoded INTEGER,
  template INTEGER,
  tags TEXT,                  -- JSON array
  updated_at INTEGER
);
```

**WebSocket Protocol**

Client → Server:
| Message | Description |
|---------|-------------|
| `auth` | Authenticate with API key |
| `set` | Set key with value and attributes |
| `delete` | Delete a key |
| `clear` | Clear all keys (admin only) |
| `ping` | Keep-alive |

Server → Client:
| Message | Description |
|---------|-------------|
| `auth_success` | Auth confirmed, includes permissions |
| `sync` | Full state sync (all keys) |
| `key_updated` | Broadcast when any key changes |
| `key_deleted` | Broadcast when key deleted |
| `cleared` | Broadcast when instance cleared |
| `error` | Error response |
| `pong` | Ping response |

**Hibernation Support**

The DO uses Cloudflare's WebSocket hibernation API:
- Sessions stored via `ws.serializeAttachment()` / `ws.deserializeAttachment()`
- Connections survive DO hibernation for cost efficiency
- State retrieved via `state.getWebSockets()`

### 3. AI Module (`src/ai/`)

#### Chat API (`POST /api/chat`)

Interactive AI chat with MindCache-aware tools:

```typescript
{
  messages: UIMessage[],  // Vercel AI SDK UIMessage format
  instanceId: string,
  mode: 'edit' | 'use',   // edit: can modify readonly; use: restricted
  model?: string          // default: gpt-4o
}
```

**MindCache Tools provided to AI:**
- `read_key` — Read a key value
- `write_key` — Create or update a key
- `delete_key` — Delete a key
- `list_keys` — List all keys, optionally filtered by tag

**System Prompt Generation:**
Keys tagged with `SystemPrompt` are automatically included in the AI context.

#### Transform API (`POST /api/transform`)

LLM-powered text transformation:

```typescript
{
  instanceId: string,
  template?: string,        // Template with {{key}} variables
  templateKey?: string,     // OR key containing template
  outputKey: string,        // Where to store result
  prompt?: string,          // Transform instructions
  promptKey?: string,       // OR key containing prompt
  model?: string            // default: gpt-4o-mini
}
```

Template variables (`{{keyName}}`) are resolved from instance data.

#### Generate Image API (`POST /api/generate-image`)

Image generation via Fireworks `flux-kontext-pro`:

```typescript
{
  instanceId: string,
  prompt?: string,
  promptKey?: string,
  outputKey: string,        // Stores base64 image
  imageKey?: string,        // Source image for editing
  imageKeys?: string[],     // Multiple sources
  seed?: number,
  aspectRatio?: string,     // default: '1:1'
  safetyTolerance?: number
}
```

#### Analyze Image API (`POST /api/analyze-image`)

GPT-4 Vision image analysis:

```typescript
{
  instanceId: string,
  imageKey?: string,        // Key with base64/URL
  imageUrl?: string,        // Direct URL
  imageBase64?: string,     // Direct base64
  prompt?: string,
  promptKey?: string,
  outputKey: string,
  model?: string            // default: gpt-4o
}
```

### 4. Authentication (`src/auth/clerk.ts`)

**Clerk JWT Verification**
- Fetches JWKS from Clerk
- Verifies signature, expiry, and issuer
- Extracts `sub` claim as userId

**API Key Verification**
- Keys stored as SHA-256 hash in D1
- Format: `mc_live_<random32chars>`
- Scoped to account, project, or instance

**WebSocket Token Exchange**
1. Client calls `POST /api/ws-token` with JWT
2. Server generates short-lived token (60s), stores hash in D1
3. Client connects to `/sync/:instanceId?token=<token>`
4. Token verified and deleted (one-time use)

### 5. Webhooks (`src/webhooks/clerk.ts`)

Receives Clerk webhook events to sync user data:

- `user.created` → Insert into D1 users table
- `user.updated` → Update email/name
- `user.deleted` → Delete user (cascades to projects/instances)

Signature verification via Svix HMAC-SHA256.

## REST API Endpoints

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List user's projects (owned + shared) |
| `POST` | `/api/projects` | Create project (auto-creates default instance) |
| `GET` | `/api/projects/:id` | Get project details |
| `PUT` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project |

### Instances

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects/:id/instances` | List project instances |
| `POST` | `/api/projects/:id/instances` | Create instance |
| `GET` | `/api/instances/:id` | Get instance details |
| `PATCH` | `/api/instances/:id` | Rename instance |
| `DELETE` | `/api/instances/:id` | Delete instance + DO storage |

### Shares

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects/:id/shares` | List project shares |
| `GET` | `/api/instances/:id/shares` | List instance shares |
| `POST` | `/api/projects/:id/shares` | Share project |
| `POST` | `/api/instances/:id/shares` | Share instance |
| `DELETE` | `/api/shares/:id` | Remove share |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/keys` | List user's API keys |
| `POST` | `/api/keys` | Create API key (returns full key once) |
| `DELETE` | `/api/keys/:id` | Delete API key |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | AI chat with MindCache tools |
| `POST` | `/api/transform` | LLM text transformation |
| `POST` | `/api/generate-image` | Generate image (Fireworks) |
| `POST` | `/api/analyze-image` | Analyze image (GPT-4 Vision) |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/ws-token` | Exchange JWT for WS token |
| `GET` | `/admin/do/:objectId` | Introspect DO (requires admin token) |

## Database Schema

**D1 Tables:**

- `users` — Synced from Clerk (id, clerk_id, email, name)
- `projects` — User projects (owner_id, name, description)
- `instances` — MindCache instances per project
- `shares` — Access grants (user/public, read/write/admin)
- `groups` — User groups for sharing
- `group_members` — Group membership
- `api_keys` — Hashed API keys with scopes
- `webhooks` — Outbound webhook configs
- `usage_logs` — API usage for billing
- `ws_tokens` — Short-lived WebSocket auth tokens

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Clerk account](https://clerk.com)

## Setup

### 1. Create D1 Database

```bash
wrangler d1 create mindcache-db
```

Update `wrangler.toml` with your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "mindcache-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 2. Run Migrations

```bash
# Local development
pnpm db:migrate:local

# Production
pnpm db:migrate
```

### 3. Configure Clerk

1. Create application at [clerk.com](https://clerk.com)
2. Enable OAuth providers
3. Set secrets:

```bash
wrangler secret put CLERK_SECRET_KEY      # sk_live_xxx or sk_test_xxx
wrangler secret put CLERK_WEBHOOK_SECRET  # From Clerk webhooks
```

4. Add webhook endpoint in Clerk Dashboard:
   - URL: `https://your-worker.workers.dev/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`

### 4. Configure AI Providers

```bash
wrangler secret put OPENAI_API_KEY    # For chat, transform, analyze-image
wrangler secret put FIREWORKS_API_KEY # For generate-image
wrangler secret put ADMIN_TOKEN       # For DO introspection
```

### 5. Local Development

```bash
# Copy example env
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your keys

# Start dev server
pnpm dev
# → http://localhost:8787
```

### 6. Deploy

```bash
pnpm deploy
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLERK_SECRET_KEY` | Yes | Clerk API secret |
| `CLERK_WEBHOOK_SECRET` | Yes | Clerk webhook signing secret |
| `OPENAI_API_KEY` | For AI | OpenAI API key |
| `FIREWORKS_API_KEY` | For images | Fireworks API key |
| `ADMIN_TOKEN` | Optional | Admin API access token |

## Development Mode

When `ENVIRONMENT=development`:
- Unauthenticated requests allowed (uses `dev-user`)
- Webhook signatures not verified
- Useful for local testing without Clerk setup

## License

MIT
