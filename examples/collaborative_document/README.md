# MindCache Collaborative Document Demo

Real-time collaborative document editing powered by MindCache Cloud and Y.Text CRDT.

## Features

- **Real-time sync** - Changes sync instantly across all connected clients
- **CRDT-based** - Uses Yjs for conflict-free collaborative editing
- **Diff-based updates** - Only sends minimal diffs, not entire documents
- **Cloud persistence** - Documents are stored in MindCache Cloud
- **Cookie persistence** - Your credentials are saved for convenience

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional):**
   ```bash
   cp env.example .env.local
   # Edit .env.local if using a custom API URL
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open the app:**
   - Navigate to [http://localhost:3001](http://localhost:3001)
   - Enter your MindCache Cloud Instance ID and API Key
   - Start editing!

## Testing Real-Time Collaboration

To see real-time collaboration in action:

1. Open the app in two different browser windows
2. Enter the same Instance ID and API Key in both
3. Type in one editor and watch changes appear in the other!

You can also open on different devices with the same credentials.

## How It Works

```typescript
import { MindCache } from 'mindcache';

// Connect to MindCache Cloud
const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    apiKey: 'your-api-key',
    baseUrl: 'https://api.mindcache.dev'
  }
});

await mc.waitForSync();

// Create or access a collaborative document
if (!mc.get_document('shared_doc')) {
  mc.set_document('shared_doc', '# Hello World');
}

// Get the Y.Text for direct manipulation
const yText = mc.get_document('shared_doc');
yText.observe(() => {
  console.log('Document updated:', yText.toString());
});

// Make edits (diff-based, efficient)
mc.replace_document_text('shared_doc', newContent);
```

## Technical Details

- **Document Type** - Uses MindCache's `document` type which stores content as Y.Text
- **Diff Algorithm** - Uses `fast-diff` to compute minimal changes
- **CRDT** - Yjs provides conflict-free real-time collaboration
- **WebSocket** - Cloud sync happens over WebSocket for low latency
