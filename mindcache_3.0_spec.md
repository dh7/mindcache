# MindCache 3.0 — Complete SDK Reference

**Version**: 3.1.0  
**Last Updated**: 2024-12-19

## Overview

MindCache is a **collaborative key-value store** for AI agents and LLM-powered applications. Built on Yjs CRDTs for real-time sync, conflict-free merging, and offline support.

### Key Features

| Feature | Description |
|---------|-------------|
| **3 Modes** | Memory Only, Offline (IndexedDB), Cloud (WebSocket + IndexedDB) |
| **Document Type** | Real-time collaborative Markdown editing with Y.Text |
| **LLM Tools** | Auto-generated Vercel AI SDK tools for each key |
| **Diff-Based Updates** | Smart replacement using character-level diffs |
| **Undo/Redo** | Per-key and global undo with full history |
| **React Hooks** | `useMindCache()` and `useMindCacheDocument()` |

---

## Installation

```bash
npm install mindcache
```

---

## Quick Start

### Memory Only (No Persistence)

```typescript
import { MindCache } from 'mindcache';

const mc = new MindCache();
mc.set_value('name', 'Alice');
mc.get_value('name'); // 'Alice'
```

### Offline Mode (IndexedDB Persistence)

```typescript
const mc = new MindCache({
  indexedDB: { dbName: 'my-app' }
});

await mc.waitForSync();
mc.set_value('name', 'Alice'); // Persisted locally
```

### Cloud Mode (Real-Time Sync)

```typescript
import { MindCache } from 'mindcache/cloud';

const mc = new MindCache({
  cloud: {
    instanceId: 'abc123',
    tokenEndpoint: '/api/ws-token'
  }
});

await mc.waitForSync();
mc.set_value('name', 'Alice'); // Synced to all clients
```

---

## Key Types

### Text (Default)

```typescript
mc.set_value('message', 'Hello World');
mc.get_value('message'); // 'Hello World'
```

### Document (Collaborative)

```typescript
// Create collaborative document
mc.set_document('notes', '# My Notes');

// Get Y.Text for editor binding
const yText = mc.get_document('notes');

// Character-level edits
mc.insert_text('notes', 0, 'New heading\n');
mc.delete_text('notes', 0, 12);

// Smart replace (uses diff for small changes)
mc.set_value('notes', '# Updated Notes');

// Get plain text
mc.get_value('notes');        // Returns string
```

**Diff-Based Updates:**

When `set_value()` is called on a document:
- Changes < 80%: Uses fast-diff for incremental insert/delete operations
- Changes > 80%: Full replacement (more efficient for rewrites)

This preserves concurrent edits and provides better undo granularity.

---

## LLM Integration

### System Prompt Generation

```typescript
mc.set_value('user_name', 'Alice', { visible: true });
mc.set_value('secret', 'xyz', { visible: false });

const prompt = mc.get_system_prompt();
// "user_name: Alice. You can rewrite "user_name" by using the write_user_name tool."
```

### AI SDK Tools

```typescript
const tools = mc.get_aisdk_tools();

// For regular keys:
// - write_<key>: Replace value

// For document keys:
// - write_<key>: Replace entire document
// - append_<key>: Add text to end
// - insert_<key>: Insert at position
// - edit_<key>: Find and replace
```

### Using with Vercel AI SDK

```typescript
import { generateText } from 'ai';
import { MindCache } from 'mindcache';

const mc = new MindCache();
mc.set_value('user_name', 'Alice');
mc.set_document('notes', '# Notes');

const result = await generateText({
  model: openai('gpt-4o'),
  system: mc.get_system_prompt(),
  tools: mc.get_aisdk_tools(),
  messages: [{ role: 'user', content: 'Add a TODO to my notes' }]
});
```

### Execute Tool Calls

```typescript
// For non-AI SDK usage
mc.executeToolCall('write_user_name', 'Bob');
mc.executeToolCall('append_notes', '\n- New item');
mc.executeToolCall('edit_notes', { find: 'TODO', replace: 'DONE' });
```

---

## Undo/Redo

### Per-Key Undo

```typescript
mc.set_value('name', 'Alice');
mc.set_value('name', 'Bob');

mc.undo('name');
mc.get_value('name'); // 'Alice'

mc.redo('name');
mc.get_value('name'); // 'Bob'
```

### Global Undo

```typescript
mc.set_value('a', '1');
mc.set_value('b', '2');

mc.undoAll(); // Reverts both
mc.redoAll(); // Restores both

mc.canUndoAll(); // boolean
mc.canRedoAll(); // boolean
```

---

## History

History is automatically enabled in Offline and Cloud modes.

```typescript
const mc = new MindCache({ indexedDB: { dbName: 'app' } });

mc.historyEnabled; // true

const history = mc.getGlobalHistory();
// [{ id, timestamp, keysAffected: ['name', 'notes'] }, ...]
```

---

## React Integration

### useMindCache

```tsx
import { useMindCache } from 'mindcache/react';

function App() {
  const { mindcache, isLoaded, error } = useMindCache({
    indexedDB: { dbName: 'my-app' }
  });

  if (!isLoaded) return <Loading />;

  return <div>{mindcache.get_value('message')}</div>;
}
```

### useMindCacheDocument

```tsx
import { useMindCacheDocument } from 'mindcache/react';

function Editor({ mc }: { mc: MindCache }) {
  const { text, yText, isReady, replaceText } = useMindCacheDocument(mc, 'notes');

  return (
    <textarea 
      value={text} 
      onChange={e => replaceText(e.target.value)} 
    />
  );
}
```

**Hook returns:**
- `yText`: Y.Text for editor bindings (Quill, CodeMirror)
- `text`: Reactive plain text string
- `isReady`: Boolean for loading state
- `insertText()`, `deleteText()`, `replaceText()`: Helper methods

---

## Subscriptions

```typescript
// Subscribe to single key
const unsubscribe = mc.subscribe('name', (value) => {
  console.log('Name changed:', value);
});

// Subscribe to all changes
mc.subscribeToAll(() => {
  console.log('Something changed');
});

// Cleanup
unsubscribe();
```

---

## Cloud Configuration

### Browser (Token-Based Auth)

```typescript
const mc = new MindCache({
  cloud: {
    instanceId: 'my-instance',
    tokenEndpoint: '/api/ws-token'  // Your API route
  }
});
```

Token endpoint returns:
```json
{ "token": "short-lived-jwt" }
```

### Server (API Key Auth)

```typescript
const mc = new MindCache({
  cloud: {
    instanceId: 'my-instance',
    apiKey: 'mc_live_xxxxx'
  }
});
```

### Connection State

```typescript
mc.connectionState; // 'disconnected' | 'connecting' | 'connected' | 'error'
mc.isLoaded;        // true when synced
mc.isCloud;         // true if cloud mode
```

---

## API Reference

### Constructor

```typescript
new MindCache(options?: {
  cloud?: {
    instanceId: string;
    tokenEndpoint?: string;  // Browser auth
    apiKey?: string;         // Server auth
    baseUrl?: string;        // Default: wss://mindcache-api.dh7777777.workers.dev
  };
  indexedDB?: {
    dbName?: string;
    storeName?: string;
  };
  accessLevel?: 'user' | 'admin';
})
```

### Key-Value Methods

| Method | Description |
|--------|-------------|
| `set_value(key, value, attrs?)` | Set key value |
| `get_value(key)` | Get key value |
| `get_attributes(key)` | Get key attributes |
| `delete_key(key)` | Delete key |
| `clear()` | Delete all keys |
| `serialize()` | Get all keys as JSON |

### Document Methods

| Method | Description |
|--------|-------------|
| `set_document(key, text?, attrs?)` | Create/get document |
| `get_document(key)` | Get Y.Text (for editors) |
| `insert_text(key, index, text)` | Insert at position |
| `delete_text(key, index, length)` | Delete range |

### LLM Methods

| Method | Description |
|--------|-------------|
| `get_aisdk_tools()` | Generate Vercel AI SDK tools |
| `get_system_prompt()` | Generate system prompt |
| `executeToolCall(name, value)` | Execute tool by name |

### Undo Methods

| Method | Description |
|--------|-------------|
| `undo(key)` | Undo changes to key |
| `redo(key)` | Redo changes to key |
| `undoAll()` | Undo all recent changes |
| `redoAll()` | Redo all undone changes |
| `canUndoAll()` | Check if undo available |
| `canRedoAll()` | Check if redo available |

### History Methods

| Method | Description |
|--------|-------------|
| `historyEnabled` | Boolean: is tracking enabled |
| `getGlobalHistory()` | Get history entries |

### Connection Methods

| Method | Description |
|--------|-------------|
| `waitForSync()` | Promise that resolves when synced |
| `disconnect()` | Close connections |

---

## Key Attributes

```typescript
interface KeyAttributes {
  type: 'text' | 'image' | 'file' | 'json' | 'document';
  readonly?: boolean;      // LLM cannot modify
  visible?: boolean;       // Include in system prompt
  hardcoded?: boolean;     // Cannot be deleted
  template?: boolean;      // Apply {{key}} injection
  tags?: string[];         // User tags
  systemTags?: SystemTag[]; // System behavior tags
}
```

---

## Dependencies

- `yjs` - CRDT for conflict-free editing
- `y-indexeddb` - IndexedDB persistence
- `fast-diff` - Character-level diffing
- `zod` - Schema validation

---

## Version History

| Version | Changes |
|---------|---------|
| 3.1.0 | Document type, LLM tools, diff-based updates, React hooks |
| 3.0.0 | Yjs integration, 3-mode architecture, global undo/redo |
| 2.x | Cloud sync, Durable Objects |
| 1.x | Core key-value, template injection |
