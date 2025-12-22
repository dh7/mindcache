# Simple Collaborative Document

A simple document editor that saves on demand using MindCache Cloud.

## Key Difference from `collaborative_document`

| Feature | `collaborative_document` | `simple_collaborative_document` |
|---------|-------------------------|--------------------------------|
| Sync | Real-time (every keystroke) | On-demand (Save button) |
| Method | `set_document()` + Y.Text | `set_value()` (plain text) |
| Use Case | Google Docs-style collaboration | Traditional save workflow |

## How It Works

```typescript
import { MindCache } from 'mindcache';

const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    apiKey: 'your-api-key',
    baseUrl: 'https://api.mindcache.dev'
  }
});

await mc.waitForSync();

// Load document
const text = mc.get_value('shared_doc') || '';

// Save on button click (not every keystroke)
function handleSave(newText: string) {
  mc.set_value('shared_doc', newText);
}
```

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional):**
   ```bash
   cp env.example .env.local
   # Edit for local development if needed
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open the app:**
   - Navigate to [http://localhost:3002](http://localhost:3002)
   - Enter your MindCache Cloud credentials
   - Edit and click Save!

## Features

- **Unsaved changes indicator** - Know when you have pending changes
- **Save/Discard buttons** - Traditional save workflow
- **Keyboard shortcut** - Ctrl+S / Cmd+S to save
- **Cloud persistence** - Data syncs to MindCache Cloud

## When to Use This Pattern

- Simple forms and documents
- When you don't need character-level collaboration
- When you want less network traffic
- Traditional "edit then save" workflows
