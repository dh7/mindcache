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

## License

MIT
