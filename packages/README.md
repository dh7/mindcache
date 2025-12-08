# MindCache Packages

This monorepo contains the MindCache 2.0 cloud infrastructure.

## Quick Start (Local Development)

### One Command Start

```bash
cd packages
./dev.sh
```

This script:
- ✓ Validates all environment variables
- ✓ Starts server on http://localhost:8787
- ✓ Starts frontend on http://localhost:3000
- ✓ Press `Ctrl+C` to stop both cleanly

---

### Prerequisites

- Node.js >= 18
- pnpm 9.x
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Install Dependencies

From the **monorepo root**:

```bash
pnpm install
```

### 2. Start the Server

```bash
cd packages/server

# Run local D1 migrations (first time only)
pnpm db:migrate:local

# Start the Cloudflare Worker locally
pnpm dev
```

Server runs at: **http://localhost:8787**

### 3. Start the Frontend

In a new terminal:

```bash
cd packages/web

# Create .env.local with required vars
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
EOF

# Start Next.js dev server
pnpm dev
```

Frontend runs at: **http://localhost:3000**

---

## Environment Variables

### Server (`packages/server`)

Set via `wrangler secret put <NAME>` for production, or `.dev.vars` for local:

| Variable | Description |
|----------|-------------|
| `CLERK_SECRET_KEY` | Clerk secret key for JWT verification |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signing secret |
| `OPENAI_API_KEY` | OpenAI API key for AI features |

### Frontend (`packages/web`)

Create `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `http://localhost:8787`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |

---

## Package Overview

| Package | Port | Description |
|---------|------|-------------|
| `@mindcache/server` | 8787 | Cloudflare Workers + Durable Objects API |
| `@mindcache/web` | 3000 | Next.js dashboard |
| `@mindcache/shared` | - | Shared types and utilities |
| `mindcache` | - | Client SDK |

---

## Development Commands

From monorepo root:

```bash
pnpm dev        # Start all packages
pnpm build      # Build all packages
pnpm typecheck  # Type check all packages
pnpm test       # Run all tests
```

Individual packages:

```bash
# Server
cd packages/server
pnpm dev              # Local dev server
pnpm db:migrate:local # Apply local migrations
pnpm test             # Run tests

# Web
cd packages/web
pnpm dev              # Next.js dev server
pnpm build            # Production build
```

