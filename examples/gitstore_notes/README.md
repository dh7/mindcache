# GitStore Notes

A demo app showing how to use `@mindcache/gitstore` with GitHub OAuth to save user data to their GitHub repositories.

## Features

- GitHub OAuth login (no PAT needed!)
- List user's repositories
- Create, edit, and delete notes
- Save notes to any repo as a JSON file
- Full CRUD with automatic Git commits

## Quick Start

### 1. Create a GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: GitStore Notes (or anything)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`
4. Click "Register application"
5. Copy the **Client ID**
6. Generate a new **Client Secret** and copy it

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your credentials:

```
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 3. Install & Run

```bash
# From monorepo root
pnpm install

# Build gitstore package first
cd packages/gitstore && pnpm build && cd ../..

# Run the example
cd examples/gitstore_notes
npm install
npm run dev
```

Open http://localhost:3000

## How It Works

### OAuth Flow

1. User clicks "Connect with GitHub"
2. Redirected to GitHub authorization page
3. User approves, redirected back with auth code
4. Server exchanges code for access token using `GitStoreAuth.handleCallback()`
5. Token stored in HTTP-only cookie

### File Operations

Uses `GitStore` to read/write `gitstore-notes.json` in the selected repo:

```typescript
const store = new GitStore({
  owner: 'user',
  repo: 'selected-repo',
  tokenProvider: async () => tokenFromCookie
});

// Load notes
const content = await store.readFile('gitstore-notes.json');

// Save notes (creates a commit!)
await store.writeFile('gitstore-notes.json', JSON.stringify(notes), {
  message: 'Update notes via GitStore Notes app'
});
```

## Key Files

- `src/app/api/auth/github/route.ts` - Initiates OAuth flow
- `src/app/api/auth/github/callback/route.ts` - Handles OAuth callback
- `src/app/api/github/notes/route.ts` - Read/write notes via GitStore
- `src/app/page.tsx` - Main UI

## Security Notes

- Client secret is **server-side only** (never in browser)
- Access token stored in HTTP-only cookie
- OAuth state parameter prevents CSRF attacks
- In production, store tokens in a database with encryption

## Deployment

For production deployment (e.g., Vercel):

1. Update GitHub OAuth App callback URL to your production domain
2. Set environment variables in your hosting platform
3. Change `NEXT_PUBLIC_BASE_URL` to your production URL
