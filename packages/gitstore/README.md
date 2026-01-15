# @mindcache/gitstore

Git repository abstraction for MindCache - list files, read/write with automatic commits.

## Installation

```bash
npm install @mindcache/gitstore
# or
pnpm add @mindcache/gitstore
```

## Usage

### Basic Usage

```typescript
import { GitStore } from '@mindcache/gitstore';

const store = new GitStore({
  owner: 'myorg',
  repo: 'myrepo',
  branch: 'main',           // optional, default: 'main'
  basePath: 'data',         // optional, scope to subdirectory
  tokenProvider: async () => process.env.GITHUB_TOKEN!
});

// List files
const files = await store.listFiles();
console.log(files); // [{ name: 'readme.md', path: 'data/readme.md', type: 'file', sha: '...' }]

// Read a file
const content = await store.readFile('readme.md');

// Write a file (creates a commit)
const result = await store.writeFile('notes.md', '# My Notes', {
  message: 'Add notes file'
});
console.log(result.sha); // commit SHA

// Delete a file
await store.deleteFile('old-file.md');
```

### With MindCache

```typescript
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { MindCache } from 'mindcache';

const gitStore = new GitStore({
  owner: 'myorg',
  repo: 'knowledge-base',
  tokenProvider: async () => getGitHubToken()
});

const mindcache = new MindCache();

const sync = new MindCacheSync(gitStore, mindcache, {
  filePath: 'my-project/mindcache.md',
  instanceName: 'My Project'
});

// Load from Git
await sync.load();

// Make changes to mindcache...
mindcache.set_value('notes', 'Some new notes');

// Save to Git
await sync.save({ message: 'Update notes' });
```

### In a Web App (Next.js)

```typescript
// Client-side
const store = new GitStore({
  owner: 'dh7',
  repo: 'mindcache',
  tokenProvider: async () => {
    const res = await fetch('/api/github/token');
    const { token } = await res.json();
    return token;
  }
});
```

### With OAuth (Recommended for Web Apps)

First, create a GitHub OAuth App at https://github.com/settings/developers

**1. Setup auth helper (server-side):**

```typescript
import { GitStoreAuth } from '@mindcache/gitstore';

const auth = new GitStoreAuth({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  redirectUri: 'https://myapp.com/api/auth/github/callback'
});
```

**2. Login route - redirect user to GitHub:**

```typescript
// app/api/auth/github/route.ts (Next.js)
export async function GET() {
  const { url, state } = auth.getAuthUrl({ scopes: ['repo'] });
  
  // Store state in cookie for CSRF verification
  const response = NextResponse.redirect(url);
  response.cookies.set('oauth_state', state, { httpOnly: true });
  return response;
}
```

**3. Callback route - exchange code for token:**

```typescript
// app/api/auth/github/callback/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  
  // Verify state matches (CSRF protection)
  const storedState = cookies().get('oauth_state')?.value;
  if (state !== storedState) {
    return new Response('Invalid state', { status: 400 });
  }
  
  // Exchange code for token
  const tokens = await auth.handleCallback(code!);
  
  // Store token securely (database, encrypted cookie, etc.)
  // Then redirect to app
  return NextResponse.redirect('/dashboard');
}
```

**4. Use the token:**

```typescript
const store = auth.createGitStore({
  owner: 'myorg',
  repo: 'myrepo',
  token: userToken // retrieved from your storage
});
```

## API

### GitStore

| Method | Description |
|--------|-------------|
| `listFiles(path?)` | List files/directories at path |
| `getTree(recursive?)` | Get full file tree |
| `readFile(path)` | Read file content as string |
| `readFileAsBuffer(path)` | Read file as ArrayBuffer |
| `writeFile(path, content, options?)` | Write file (creates commit) |
| `deleteFile(path, options?)` | Delete file (creates commit) |
| `getCommitHistory(path?, limit?)` | Get commit history |
| `getFileSha(path)` | Get file SHA |
| `exists(path)` | Check if path exists |

### MindCacheSync

| Method | Description |
|--------|-------------|
| `save(options?)` | Save MindCache to Git |
| `load(options?)` | Load MindCache from Git |
| `exists()` | Check if file exists |
| `getHistory(limit?)` | Get commit history |
| `enableAutoSync(debounceMs?)` | Enable auto-save |
| `disableAutoSync()` | Disable auto-save |

### GitStoreAuth

| Method | Description |
|--------|-------------|
| `getAuthUrl(options?)` | Generate GitHub OAuth URL |
| `handleCallback(code)` | Exchange auth code for token |
| `refreshToken(token)` | Refresh an access token |
| `getUser(token)` | Get authenticated user info |
| `validateToken(token)` | Check if token is valid |
| `revokeToken(token)` | Revoke an access token |
| `createGitStore(options)` | Create GitStore with token |

## License

MIT
