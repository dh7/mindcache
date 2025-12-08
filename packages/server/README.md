# @mindcache/server

Cloudflare Workers + Durable Objects backend for MindCache 2.0.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Clerk account](https://clerk.com)

## Setup

### 1. Create D1 Database

```bash
# Create the database
wrangler d1 create mindcache-db

# Copy the database_id from the output and update wrangler.toml
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
# Apply schema locally (for development)
pnpm db:migrate:local

# Apply schema to production
pnpm db:migrate
```

### 3. Set Up Clerk

1. Create a Clerk application at [clerk.com](https://clerk.com)
2. Enable OAuth providers (Google, GitHub)
3. Get your secret key from Dashboard → API Keys

```bash
# Set Clerk secret key
wrangler secret put CLERK_SECRET_KEY
# Paste your sk_live_xxx or sk_test_xxx key

# Set webhook secret (from Clerk Dashboard → Webhooks)
wrangler secret put CLERK_WEBHOOK_SECRET
```

### 4. Configure Clerk Webhooks

In Clerk Dashboard → Webhooks:

1. Add endpoint: `https://your-worker.workers.dev/webhooks/clerk`
2. Select events:
   - `user.created`
   - `user.updated`
   - `user.deleted`
3. Copy the signing secret and set it as `CLERK_WEBHOOK_SECRET`

## Development

```bash
# Start local development server
pnpm dev

# The worker runs at http://localhost:8787
```

## Deployment

```bash
# Deploy to Cloudflare
pnpm deploy
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/sync/:instanceId` | WebSocket | Real-time sync |
| `/webhooks/clerk` | POST | Clerk webhook receiver |
| `/api/projects` | GET | List user's projects |
| `/api/projects` | POST | Create project |

## Architecture

```
Worker (auth + routing)
    │
    ├── D1 Database (global data)
    │   ├── users (synced from Clerk)
    │   ├── projects
    │   ├── instances
    │   ├── shares
    │   └── api_keys
    │
    └── Durable Objects (per instance)
        └── MindCacheInstance
            ├── SQLite (keys/values)
            └── WebSocket (real-time)
```

