# CI/CD Documentation

## Overview

This monorepo uses **pnpm workspaces** + **Turborepo** for build orchestration and **GitHub Actions** for CI/CD.

## Monorepo Structure

```
mindcache/
├── packages/
│   ├── mindcache/      # Core library (npm: mindcache)
│   ├── shared/         # Shared types & protocol
│   ├── server/         # Cloudflare Workers backend
│   └── web/            # Dashboard UI (Next.js)
├── examples/
│   ├── nextjs_client_demo/
│   └── nextjs_cloud_demo/
├── pnpm-workspace.yaml # Workspace config
├── turbo.json          # Turborepo task config
└── package.json        # Root scripts & dependencies
```

## Package Manager: pnpm

We use **pnpm v9.15.0** (specified in `packageManager` field).

```bash
# Install all dependencies
pnpm install

# Run command in specific package
pnpm --filter mindcache build

# Run command in all packages
pnpm run build  # Uses turbo under the hood
```

## Turborepo Tasks

Defined in `turbo.json`:

| Task | Description | Dependencies |
|------|-------------|--------------|
| `build` | Build all packages | `^build` (build deps first) |
| `lint` | Lint all packages | `^build` |
| `test` | Run tests | `build` |
| `typecheck` | TypeScript check | `^build` |
| `dev` | Development mode | None (no cache) |

## GitHub Actions Workflows

### 1. `ci.yml` - Main CI Pipeline

Triggered on: push/PR to `main`, `develop`

**Jobs:**

| Job | Node Versions | Purpose |
|-----|---------------|---------|
| `test` | 18.x, 20.x, 22.x | Install → Lint → Test → Build |
| `lint` | 20.x | ESLint + TypeScript check |
| `security` | 20.x | `pnpm audit` for vulnerabilities |
| `examples` | 18.x, 20.x | Build example apps |

### 2. `pr-validation.yml` - PR Checks

Triggered on: PRs to `main`

Runs validation checks + bundle size check before merge.

### 3. `deploy-pages.yml` - GitHub Pages

Triggered on: push to `main`

Deploys `/docs` folder to GitHub Pages.

### 4. `deploy-server.yml` - Cloudflare Workers Deployment

Triggered on:
- Push to `main` when `packages/server/**` or `packages/shared/**` change
- Manual dispatch via GitHub UI

**Features:**
- Checks for pending D1 database migrations
- Applies migrations automatically if needed
- Deploys worker to Cloudflare Workers production
- Runs a post-deployment smoke test

**Required Secrets:**
| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers + D1 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

**Manual Deployment:**
You can trigger a manual deployment from the GitHub Actions tab:
1. Go to Actions → "Deploy Server"
2. Click "Run workflow"
3. Optionally check "Skip database migrations"

## ESLint Setup

### Root Config (`.eslintrc.js`)
Base rules for all packages.

### Package-specific Configs
Each package can extend the root config:

```javascript
// packages/mindcache/.eslintrc.js
module.exports = {
  extends: ['../../.eslintrc.js'],
  env: { browser: true, node: true },
  // Package-specific overrides...
};
```

### Browser Globals
Packages using browser APIs (WebSocket, window, etc.) need `env: { browser: true }` in their eslint config.

## Pre-commit Hooks

We use **husky** + **lint-staged** to auto-fix code before commits:

```
git commit
    ↓
.husky/pre-commit runs
    ↓
lint-staged runs eslint --fix on staged *.ts/*.tsx files
    ↓
Fixed files are re-staged
    ↓
Commit succeeds (or fails if unfixable errors)
```

Config in `package.json`:
```json
{
  "lint-staged": {
    "*.{ts,tsx}": "eslint --fix"
  }
}
```

## Security Audits

### pnpm Overrides

We use overrides to patch vulnerable transitive dependencies:

```json
{
  "pnpm": {
    "overrides": {
      "esbuild": ">=0.25.0",
      "jsondiffpatch": ">=0.7.2"
    }
  }
}
```

### Audit Level

CI runs `pnpm audit --audit-level=moderate` which fails on moderate+ vulnerabilities.

## Environment Variables

### CI Build Requirements

For packages using Clerk auth (`packages/web`):

```yaml
env:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_placeholder
  CLERK_SECRET_KEY: sk_test_placeholder
```

These are dummy values for build-time only (Clerk validates at runtime, not build).

## Common Issues

### Lock file out of sync
```bash
pnpm install  # Regenerates pnpm-lock.yaml
```

### ESLint version conflicts
Ensure `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` are the same major version.

### Browser globals undefined
Add to package's `.eslintrc.js`:
```javascript
env: { browser: true }
```

## Local Development

```bash
# Install deps
pnpm install

# Run all in dev mode
pnpm dev

# Run specific package
pnpm --filter @mindcache/web dev

# Run full CI locally
pnpm lint && pnpm test && pnpm build
```

