# Collaborative Document Demo

Real-time collaborative document editing with MindCache's document type.

## Features

- **Split-screen editors**: Two MindCache instances editing the same document
- **Real-time sync**: Changes appear instantly in both editors
- **Offline simulation**: Click "Go Offline" to disconnect
- **Diff-based updates**: Small edits don't replace entire document
- **CRDT merging**: Conflicting edits merge automatically

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3002

## How It Works

Each editor has its own `MindCache` instance:

```typescript
const mc1 = new MindCache({ indexedDB: { dbName: 'collab-demo-1' } });
const mc2 = new MindCache({ indexedDB: { dbName: 'collab-demo-2' } });

// Create collaborative document
mc1.set_document('shared_doc', '# Hello World');

// Get Y.Text for reactive updates
const yText = mc1.get_document('shared_doc');
yText.observe(() => {
  console.log('Document changed:', yText.toString());
});
```

## For True Cloud Sync

To sync across browsers/devices, use cloud mode:

```typescript
import { MindCache } from 'mindcache/cloud';

const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    tokenEndpoint: '/api/ws-token'
  }
});

await mc.waitForSync();
mc.set_document('notes', '# Collaborative Notes');
```

## Offline Support

```typescript
// Go offline
mc.disconnect();

// Changes queue locally...
mc.set_value('local', 'still works');

// Reconnect (requires new instance in current API)
const mc2 = new MindCache({ cloud: { ... } });
await mc2.waitForSync(); // Queued changes sync
```
