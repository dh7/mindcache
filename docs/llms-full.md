# MindCache - Complete LLM Documentation

> This document is optimized for LLMs to understand and work with MindCache. It contains comprehensive API documentation with extensive code examples.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Core Concepts](#core-concepts)
4. [Basic Operations](#basic-operations)
5. [Attributes & Metadata](#attributes--metadata)
6. [Template Injection](#template-injection)
7. [Tags & Organization](#tags--organization)
8. [LLM Tool Generation](#llm-tool-generation)
9. [System Prompt Generation](#system-prompt-generation)
10. [Event System](#event-system)
11. [Serialization](#serialization)
12. [Image & File Support](#image--file-support)
13. [Cloud Sync](#cloud-sync)
14. [Local Persistence (IndexedDB)](#local-persistence-indexeddb)
15. [React Hook - useMindCache](#react-hook---usemindcache)
16. [Integration Patterns](#integration-patterns)
17. [Common Use Cases](#common-use-cases)
18. [Error Handling](#error-handling)
19. [TypeScript Types](#typescript-types)
20. [Quick Reference](#quick-reference)
21. [Complete App Examples](#complete-app-examples)
22. [Best Practices Summary](#best-practices-summary)

---

## Overview

MindCache is a TypeScript library for managing short-term memory in AI agents. It provides:

- **Key-value storage** optimized for LLM consumption
- **Document type** for collaborative Markdown editing (v3.1+)
- **Automatic tool generation** for Vercel AI SDK integration
- **System prompt generation** with memory context
- **Template injection** with `{{key}}` syntax
- **Undo/Redo** per-key and global (v3.0+)
- **Cloud sync** with real-time collaboration (v2.0+)

### When to Use MindCache

✅ **Good for:**
- AI agent memory during conversations
- Collaborative document editing with LLMs
- Form data tracking with AI assistance
- Session-based context management
- Sharing state between AI tools
- Real-time collaboration on AI-managed data

❌ **Not designed for:**
- Long-term persistent storage (use a database)
- Large binary file storage
- High-frequency writes (>100/sec)

---

## Installation

```bash
npm install mindcache
```

### Requirements
- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Optional: `ai` package >= 3.0.0 for Vercel AI SDK integration

---

## Core Concepts

### The MindCache Instance

```typescript
import { mindcache } from 'mindcache';

// Use the default singleton instance
mindcache.set_value('key', 'value');

// Or create your own instance
import { MindCache } from 'mindcache';
const mc = new MindCache();
mc.set_value('key', 'value');
```

### Key-Value Model

Every entry in MindCache has:
- **key**: string identifier (e.g., 'userName', 'preferences')
- **value**: any JSON-serializable data
- **attributes**: metadata controlling behavior

```typescript
// Simple value
mindcache.set_value('userName', 'Alice');

// Complex value (automatically JSON-serialized)
mindcache.set_value('preferences', {
  theme: 'dark',
  language: 'en',
  notifications: true
});

// Value with attributes
mindcache.set_value('apiKey', 'secret123', {
  readonly: true,
  visible: false,
  tags: ['credentials']
});
```

---

## Basic Operations

### Setting Values

```typescript
// Signature
set_value(key: string, value: any, attributes?: KeyAttributes): void

// Examples
mindcache.set_value('userName', 'Alice');
mindcache.set_value('age', 30);
mindcache.set_value('isActive', true);
mindcache.set_value('settings', { theme: 'dark', fontSize: 14 });
mindcache.set_value('tags', ['important', 'work', 'project']);
```

### Getting Values

```typescript
// Signature
get_value(key: string): any

// Examples
const name = mindcache.get_value('userName');
// Returns: 'Alice'

const settings = mindcache.get_value('settings');
// Returns: { theme: 'dark', fontSize: 14 }

const missing = mindcache.get_value('nonexistent');
// Returns: undefined
```

### Checking Existence

```typescript
// Signature
has(key: string): boolean

// Examples
if (mindcache.has('userName')) {
  console.log('User is set');
}

const exists = mindcache.has('preferences');
// Returns: true or false
```

### Deleting Values

```typescript
// Signature
delete(key: string): void

// Examples
mindcache.delete('tempData');
mindcache.delete('sessionToken');
```

### Clearing All Data

```typescript
// Signature
clear(): void

// Example
mindcache.clear();
// All keys removed
```

### Getting All Data

```typescript
// Signature
getAll(): Record<string, KeyEntry>

// Example
const allData = mindcache.getAll();
// Returns: {
//   userName: { value: 'Alice', attributes: {...} },
//   preferences: { value: {...}, attributes: {...} }
// }

// Iterate over all keys
for (const [key, entry] of Object.entries(mindcache.getAll())) {
  console.log(`${key}: ${JSON.stringify(entry.value)}`);
}
```

---

## Document Type (v3.1+)

Create collaborative documents for real-time editing with LLMs.

### Creating Documents

```typescript
// Create a new document
mc.set_document('notes', '# My Notes');

// Create empty document
mc.set_document('draft');
```

### Getting Document Content

```typescript
// Get Y.Text for editor binding (Quill, CodeMirror, etc.)
const yText = mc.get_document('notes');

// Get plain text snapshot
const text = mc.get_document_text('notes');

// get_value also returns plain text for documents
const text2 = mc.get_value('notes');
```

### Character-Level Editing

```typescript
// Insert at position
mc.insert_text('notes', 0, 'New heading\n');

// Delete range
mc.delete_text('notes', 0, 12);
```

### Smart Replace (Diff-Based)

```typescript
// Replace all content - uses diff for small changes
mc.replace_document_text('notes', '# Updated Notes');

// How it works:
// - Changes < 80%: Uses fast-diff for incremental operations
// - Changes > 80%: Full replacement (more efficient for rewrites)

// Custom threshold
mc.replace_document_text('notes', newContent, 0.5); // 50% threshold

// set_value on documents also uses diff!
mc.set_value('notes', 'New content'); // Routes to replace_document_text
```

### Benefits of Diff-Based Updates

- **Better undo**: Undo removes just the change, not entire document
- **Concurrent edits preserved**: Other users' changes merge cleanly
- **Smaller network sync**: Only changed characters transmitted

### Document LLM Tools

Documents get additional tools automatically:

```typescript
const tools = mc.get_aisdk_tools();
// For document key 'notes':
// - write_notes: Replace entire document
// - append_notes: Add text to end
// - insert_notes: Insert at position
// - edit_notes: Find and replace
```

### Editor Integration

```tsx
import { useMindCacheDocument } from 'mindcache/react';

function MarkdownEditor({ mc }) {
  const { text, yText, replaceText } = useMindCacheDocument(mc, 'notes');
  
  return (
    <textarea 
      value={text} 
      onChange={e => replaceText(e.target.value)} 
    />
  );
  
  // For rich editors, use yText directly:
  // const binding = new QuillBinding(yText, quillInstance);
}
```

---

## Undo/Redo (v3.0+)

MindCache supports both per-key and global undo/redo.

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

mc.undoAll(); // Reverts all recent changes
mc.redoAll(); // Restores them

mc.canUndoAll(); // boolean
mc.canRedoAll(); // boolean
```

### History Tracking

History is enabled automatically in Offline and Cloud modes:

```typescript
const mc = new MindCache({ indexedDB: { dbName: 'app' } });

mc.historyEnabled; // true

const history = mc.getGlobalHistory();
// [{ id, timestamp, keysAffected: ['name', 'notes'] }, ...]
```

---

## Attributes & Metadata

### Available Attributes

```typescript
interface KeyAttributes {
  readonly?: boolean;    // Prevent AI from modifying this key
  visible?: boolean;     // Include in system prompt (default: true)
  hardcoded?: boolean;   // Cannot be deleted
  template?: boolean;    // Enable {{key}} resolution in value
  tags?: string[];       // Categorize entries
}
```

### Setting Attributes

```typescript
// At creation time
mindcache.set_value('apiKey', 'secret123', {
  readonly: true,
  visible: false
});

// Update attributes later
mindcache.set_attributes('apiKey', {
  readonly: true,
  visible: false,
  tags: ['credentials', 'sensitive']
});
```

### Getting Attributes

```typescript
// Signature
get_attributes(key: string): KeyAttributes | undefined

// Example
const attrs = mindcache.get_attributes('apiKey');
// Returns: { readonly: true, visible: false, tags: ['credentials'] }

if (attrs?.readonly) {
  console.log('This key is read-only');
}
```

### Setting Attributes (v3.2+)

Update only the attributes of a key without modifying its value. Useful for updating tags, permissions, etc. on document type keys.

```typescript
// Signature
set_attributes(key: string, attributes: Partial<KeyAttributes>): void

// Example: Add a tag without changing the value
mindcache.set_attributes('notes', {
  tags: ['important', 'shared']
});

// Example: Toggle LLMWrite permission
mindcache.set_attributes('config', {
  systemTags: ['LLMRead']  // Remove LLMWrite, keep LLMRead
});

// Example: Update document type without overwriting Y.Text
mindcache.set_document('article', 'Initial content');
// Later, update only the tags:
mindcache.set_attributes('article', { tags: ['published'] });
// The collaborative document content is preserved!
```

### Readonly Keys

Readonly keys cannot be modified by AI-generated tools, only by your code.

```typescript
// Create readonly key
mindcache.set_value('systemConfig', { maxRetries: 3 }, {
  readonly: true
});

// AI tools will NOT include write_systemConfig
const tools = mindcache.get_aisdk_tools();
// write_systemConfig is NOT in tools

// But you can still modify it programmatically
mindcache.set_value('systemConfig', { maxRetries: 5 }, {
  readonly: true
});
```

### Invisible Keys

Invisible keys exist but don't appear in system prompts.

```typescript
// Create invisible key (for internal use)
mindcache.set_value('internalState', { step: 3 }, {
  visible: false
});

// Won't appear in system prompt
const prompt = mindcache.get_system_prompt();
// internalState is NOT mentioned

// But you can still read it
const state = mindcache.get_value('internalState');
// Returns: { step: 3 }
```

---

## Template Injection

Template injection replaces `{{key}}` placeholders with actual values.

### Basic Template Injection

```typescript
// Signature
injectSTM(template: string): string

// Setup
mindcache.set_value('userName', 'Alice');
mindcache.set_value('city', 'New York');
mindcache.set_value('role', 'developer');

// Inject values
const message = mindcache.injectSTM(
  'Hello {{userName}}! Welcome to {{city}}.'
);
// Returns: 'Hello Alice! Welcome to New York.'

const prompt = mindcache.injectSTM(
  'You are helping {{userName}}, a {{role}} based in {{city}}.'
);
// Returns: 'You are helping Alice, a developer based in New York.'
```

### Template Keys

Keys marked as templates have their values resolved automatically.

```typescript
// Create a template key
mindcache.set_value('greeting', 'Hello {{userName}}!', {
  template: true
});

mindcache.set_value('userName', 'Alice');

// When getting a template key, placeholders are resolved
const greeting = mindcache.get_value('greeting');
// Returns: 'Hello Alice!'
```

### Nested Template Resolution

```typescript
mindcache.set_value('firstName', 'Alice');
mindcache.set_value('lastName', 'Smith');
mindcache.set_value('fullName', '{{firstName}} {{lastName}}', { template: true });
mindcache.set_value('signature', 'Best regards, {{fullName}}', { template: true });

const sig = mindcache.get_value('signature');
// Returns: 'Best regards, Alice Smith'
```

### Missing Keys in Templates

```typescript
mindcache.set_value('userName', 'Alice');

const result = mindcache.injectSTM('Hello {{userName}}, your ID is {{userId}}');
// Returns: 'Hello Alice, your ID is {{userId}}'
// Missing keys are left as-is
```

---

## Tags & Organization

Tags help organize and filter entries.

### Adding Tags

```typescript
// At creation
mindcache.set_value('userName', 'Alice', { tags: ['user', 'context'] });
mindcache.set_value('userEmail', 'alice@example.com', { tags: ['user', 'contact'] });
mindcache.set_value('projectName', 'MindCache', { tags: ['context'] });
mindcache.set_value('tempNote', 'Meeting at 3pm'); // No tags

// Add tags later
mindcache.addTag('tempNote', 'notes');
```

### Removing Tags

```typescript
// Signature
removeTag(key: string, tag: string): void

// Example
mindcache.removeTag('userName', 'context');
```

### Getting Tags

```typescript
// Signature
getTags(key: string): string[]

// Example
const tags = mindcache.getTags('userName');
// Returns: ['user', 'context']
```

### Checking for Tags

```typescript
// Signature
hasTag(key: string, tag: string): boolean

// Example
if (mindcache.hasTag('userName', 'user')) {
  console.log('This is user data');
}
```

### Getting Tagged Entries

```typescript
// Signature
getTagged(tag: string): string

// Example
mindcache.set_value('userName', 'Alice', { tags: ['context'] });
mindcache.set_value('userRole', 'developer', { tags: ['context'] });
mindcache.set_value('tempData', 'some value'); // No tags

const contextData = mindcache.getTagged('context');
// Returns: 'userName: Alice, userRole: developer'
```

### Filtering Keys by Tag

```typescript
// Get all keys with a specific tag
const allKeys = Object.keys(mindcache.getAll());
const userKeys = allKeys.filter(key => mindcache.hasTag(key, 'user'));
// Returns: ['userName', 'userEmail']

// Get entries with a specific tag
const userEntries = Object.entries(mindcache.getAll())
  .filter(([key]) => mindcache.hasTag(key, 'user'))
  .map(([key, entry]) => ({ key, value: entry.value }));
```

---

## LLM Tool Generation

MindCache automatically generates tools for Vercel AI SDK.

### Generating Tools

```typescript
// Signature
get_aisdk_tools(): Record<string, Tool>

// Setup
mindcache.set_value('userName', 'Alice');
mindcache.set_value('favoriteColor', 'blue');
mindcache.set_value('systemConfig', { debug: false }, { readonly: true });

// Generate tools
const tools = mindcache.get_aisdk_tools();
// Returns: {
//   write_userName: { description: '...', parameters: {...}, execute: fn },
//   write_favoriteColor: { description: '...', parameters: {...}, execute: fn }
// }
// Note: write_systemConfig is NOT included (readonly)
```

### Using with Vercel AI SDK

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { mindcache } from 'mindcache';

// Setup memory
mindcache.set_value('userName', 'Alice');
mindcache.set_value('favoriteColor', 'blue');
mindcache.set_value('lastTask', 'planning vacation');

// Get tools and system prompt
const tools = mindcache.get_aisdk_tools();
const systemPrompt = mindcache.get_system_prompt();

// Generate response
const { text, toolCalls } = await generateText({
  model: openai('gpt-4'),
  tools: tools,
  system: systemPrompt,
  prompt: 'Actually, my favorite color is green now.'
});

// AI will call write_favoriteColor('green')
// The tool executes automatically and updates mindcache

// Verify the update
console.log(mindcache.get_value('favoriteColor'));
// Output: 'green'
```

### Streaming with Tools

```typescript
import { streamText } from 'ai';

const result = await streamText({
  model: openai('gpt-4'),
  tools: mindcache.get_aisdk_tools(),
  system: mindcache.get_system_prompt(),
  prompt: userMessage
});

// Stream the response
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// After streaming, tool calls have been executed
// MindCache is updated automatically
```

### Tool Descriptions

Each generated tool includes:
- Name: `write_<keyName>`
- Description: Explains what the key stores
- Parameters: The new value to set
- Execute function: Updates the MindCache entry

```typescript
// Example tool structure
{
  write_userName: {
    description: 'Update the value of "userName". Current value: Alice',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'string', description: 'The new value for userName' }
      },
      required: ['value']
    },
    execute: async ({ value }) => {
      mindcache.set_value('userName', value);
      return `Updated userName to: ${value}`;
    }
  }
}
```

---

## System Prompt Generation

Generate context-aware system prompts containing all memory.

### Basic System Prompt

```typescript
// Signature
get_system_prompt(): string

// Setup
mindcache.set_value('userName', 'Alice');
mindcache.set_value('userRole', 'developer');
mindcache.set_value('secretKey', 'abc123', { visible: false });

// Generate
const prompt = mindcache.get_system_prompt();
// Returns something like:
// "userName: Alice. You can rewrite "userName" by using the write_userName tool.
//  userRole: developer. You can rewrite "userRole" by using the write_userRole tool.
//  $date: 2025-01-15
//  $time: 14:30:00"
// Note: secretKey is NOT included (visible: false)
```

### Built-in Temporal Keys

MindCache automatically provides date/time context:

```typescript
const date = mindcache.get_value('$date');
// Returns: '2025-01-15' (current date)

const time = mindcache.get_value('$time');
// Returns: '14:30:00' (current time)

// These appear in system prompts automatically
```

### Formatted Memory String

```typescript
// Signature
getSTM(): string

// Get formatted memory string (without tool instructions)
const memory = mindcache.getSTM();
// Returns:
// "userName: Alice
//  userRole: developer
//  preferences: {"theme":"dark"}"
```

### Combining with Custom Instructions

```typescript
const customSystemPrompt = `
You are a helpful AI assistant.

## User Context
${mindcache.getSTM()}

## Your Capabilities
You can update the user's information using the available tools.
Always confirm before making changes.
`;
```

---

## Event System

Subscribe to changes in MindCache.

### Subscribe to Specific Key

```typescript
// Signature
subscribe(key: string, listener: (value: any) => void): void
unsubscribe(key: string, listener: (value: any) => void): void

// Example
function onUserNameChange(newValue) {
  console.log(`userName changed to: ${newValue}`);
}

// Subscribe
mindcache.subscribe('userName', onUserNameChange);

// Update triggers the callback
mindcache.set_value('userName', 'Bob');
// Console: 'userName changed to: Bob'

// Unsubscribe when done
mindcache.unsubscribe('userName', onUserNameChange);
```

### Subscribe to All Changes

```typescript
// Signature
subscribeToAll(listener: () => void): void
unsubscribeFromAll(listener: () => void): void

// Example
function onAnyChange() {
  console.log('Something changed!');
  console.log('Current state:', mindcache.getAll());
}

// Subscribe
mindcache.subscribeToAll(onAnyChange);

// Any update triggers the callback
mindcache.set_value('anything', 'value');
// Console: 'Something changed!'

// Unsubscribe
mindcache.unsubscribeFromAll(onAnyChange);
```

### React Integration Pattern

```typescript
import { useEffect, useState } from 'react';
import { mindcache } from 'mindcache';

function useMemory(key: string) {
  const [value, setValue] = useState(mindcache.get_value(key));

  useEffect(() => {
    const listener = (newValue) => setValue(newValue);
    mindcache.subscribe(key, listener);
    return () => mindcache.unsubscribe(key, listener);
  }, [key]);

  return value;
}

// Usage
function UserDisplay() {
  const userName = useMemory('userName');
  return <div>Hello, {userName}!</div>;
}
```

---

## Serialization

Export and import MindCache state.

### JSON Serialization

```typescript
// Export to JSON
const json = mindcache.toJSON();
// Returns: '{"userName":{"value":"Alice","attributes":{}},...}'

// Import from JSON
mindcache.fromJSON(json);
```

### Markdown Serialization

```typescript
// Export to Markdown
const markdown = mindcache.toMarkdown();
// Returns:
// ## userName
// Alice
// 
// ## preferences
// ```json
// {"theme":"dark"}
// ```

// Import from Markdown
mindcache.fromMarkdown(markdown);
```

### Complete State Serialization

```typescript
// Get complete state object
const state = mindcache.serialize();
// Returns: { keys: {...}, metadata: {...} }

// Restore complete state
mindcache.deserialize(state);
```

### Backup and Restore Pattern

```typescript
// Backup before risky operation
const backup = mindcache.serialize();

try {
  // Perform risky updates
  mindcache.set_value('critical', await riskyOperation());
} catch (error) {
  // Restore on failure
  mindcache.deserialize(backup);
  console.error('Rolled back due to:', error);
}
```

---

## Image & File Support

Store binary data in MindCache.

### Adding Images

```typescript
// Signature
add_image(key: string, base64Data: string, mimeType: string): void

// Example
const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAA...'; // Base64 encoded image
mindcache.add_image('profilePic', imageBase64, 'image/png');
mindcache.add_image('logo', logoBase64, 'image/svg+xml');
```

### Adding Files

```typescript
// Signature
set_base64(key: string, base64Data: string, mimeType: string, type: 'file' | 'image'): void

// Example
const pdfBase64 = 'JVBERi0xLjQK...'; // Base64 encoded PDF
mindcache.set_base64('document', pdfBase64, 'application/pdf', 'file');
```

### Getting Data URLs

```typescript
// Signature
get_data_url(key: string): string

// Example
const imageUrl = mindcache.get_data_url('profilePic');
// Returns: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'

// Use in HTML
const img = document.createElement('img');
img.src = imageUrl;
```

### Image in AI Context

```typescript
// Store image for AI analysis
mindcache.add_image('screenshot', screenshotBase64, 'image/png');

// The image can be referenced in prompts
// (Actual image analysis requires vision-capable models)
```

---

## Cloud Sync

MindCache 2.0+ supports cloud persistence and real-time sync via WebSockets.

### Authentication Patterns

MindCache supports two authentication patterns for cloud connections:

| Pattern | Security | Use Case | API Key Location |
|---------|----------|----------|------------------|
| `tokenEndpoint` | **Highest** | Production apps | Backend only |
| `apiKey` | Moderate | Quick demos/testing | Browser (exposed) |

### Pattern 1: Secure Token Endpoint (Production)

**Recommended for production apps.** API key stays on your server, never exposed to browser.

```typescript
// Client-side: page.tsx or component.tsx
import { MindCache } from 'mindcache';

const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    baseUrl: process.env.NEXT_PUBLIC_MINDCACHE_API_URL, // e.g., 'https://api.mindcache.dev'
    tokenEndpoint: '/api/ws-token'  // Your backend route
  }
});

// Wait for initial sync before using data
await mc.waitForSync();
mc.set_value('userName', 'Alice'); // Syncs to cloud!
```

```typescript
// Server-side: app/api/ws-token/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.MINDCACHE_API_KEY; // Secret, never exposed!
  const apiUrl = process.env.MINDCACHE_API_URL || 'https://api.mindcache.dev';
  const instanceId = request.nextUrl.searchParams.get('instanceId');

  if (!apiKey || !instanceId) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  // Forward token request to MindCache API
  const response = await fetch(`${apiUrl}/api/ws-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ instanceId, permission: 'write' })
  });

  const tokenData = await response.json();
  return NextResponse.json(tokenData);
}
```

### Pattern 2: Direct API Key (Quick Demos)

**Simpler setup for demos.** SDK automatically fetches tokens. API key visible in browser.

```typescript
// Client-side: No backend route needed!
import { MindCache } from 'mindcache';

const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    apiKey: 'del_xxx:sec_xxx', // Or 'mc_live_xxx' format
    baseUrl: 'https://api.mindcache.dev'
  }
});

await mc.waitForSync();
mc.set_value('counter', 1); // Syncs instantly!
```

The SDK automatically:
1. Calls `POST {baseUrl}/api/ws-token` with your API key
2. Gets a short-lived token (60 seconds)
3. Connects to WebSocket with the token

**Supported API key formats:**
- Regular API keys: `mc_live_xxx` or `mc_test_xxx`
- Delegate keys: `del_xxx:sec_xxx`

### waitForSync() - Awaiting Initial Data

Always call `waitForSync()` before reading data to ensure cloud data is loaded:

```typescript
const mc = new MindCache({
  cloud: { instanceId: 'xxx', apiKey: 'xxx', baseUrl: 'https://api.mindcache.dev' }
});

// IMPORTANT: Wait for initial sync before reading!
await mc.waitForSync();

// Now safe to read data
const userName = mc.get_value('userName'); // Has cloud data
```

### Connection States

```typescript
console.log(mc.connectionState);
// 'disconnected' | 'connecting' | 'connected' | 'error'

console.log(mc.isLoaded);
// true when initial cloud data is loaded

console.log(mc.isCloud);
// true when connected to cloud
```

### Real-Time Sync

Changes sync automatically to all connected clients:

```typescript
// Client A: Sets a value
mc.set_value('counter', 42);

// Client B: Subscribes to changes
mc.subscribe('counter', (value) => {
  console.log('Counter updated by another user:', value);
  // Outputs: 'Counter updated by another user: 42'
});

// Or subscribe to all changes
mc.subscribeToAll(() => {
  console.log('Something changed!');
  updateUI(mc.getAll());
});
```

### React Integration Pattern

```typescript
'use client';
import { useRef, useEffect, useState } from 'react';
import { MindCache } from 'mindcache';

export default function CloudComponent({ instanceId }: { instanceId: string }) {
  const mcRef = useRef<MindCache | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [data, setData] = useState<Record<string, any>>({});

  // Initialize MindCache once
  if (!mcRef.current && instanceId) {
    mcRef.current = new MindCache({
      cloud: {
        instanceId,
        baseUrl: process.env.NEXT_PUBLIC_MINDCACHE_API_URL,
        tokenEndpoint: '/api/ws-token' // For production
        // OR: apiKey: 'del_xxx:sec_xxx' // For demos
      }
    });
  }

  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;

    const handleChange = () => {
      setIsLoaded(mc.isLoaded);
      if (mc.isLoaded) {
        setData({
          name: mc.get_value('name') || '',
          email: mc.get_value('email') || ''
        });
      }
    };

    handleChange(); // Initial check
    mc.subscribeToAll(handleChange);

    return () => {
      mc.unsubscribeFromAll(handleChange);
      mc.disconnect();
    };
  }, [instanceId]);

  if (!isLoaded) return <div>Loading...</div>;

  return (
    <div>
      <input
        value={data.name}
        onChange={(e) => {
          mcRef.current?.set_value('name', e.target.value);
        }}
      />
    </div>
  );
}
```

### Server-Side Usage (API Routes)

```typescript
// app/api/chat/route.ts
import { MindCache } from 'mindcache';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, instanceId } = await req.json();

  // Connect with API key (server-side only!)
  const mc = new MindCache({
    cloud: {
      instanceId,
      apiKey: process.env.MINDCACHE_API_KEY,
      baseUrl: 'https://api.mindcache.dev'
    }
  });

  await mc.waitForSync(); // Wait for cloud data

  const result = await streamText({
    model: openai('gpt-4'),
    tools: mc.get_aisdk_tools(),
    system: mc.get_system_prompt(),
    messages
  });

  mc.disconnect(); // Clean up

  return result.toDataStreamResponse();
}
```

### Environment Variables

```bash
# .env.local (for Next.js apps)

# Server-side only (never exposed to browser)
MINDCACHE_API_KEY=mc_live_xxx
# OR for delegate keys:
MINDCACHE_API_KEY=del_xxx:sec_xxx

# Client-side (exposed to browser, safe)
NEXT_PUBLIC_MINDCACHE_API_URL=https://api.mindcache.dev

# Instance IDs (exposed, just identifiers)
NEXT_PUBLIC_INSTANCE_ID=your-instance-id
```

### Disconnecting

```typescript
// Clean disconnect when component unmounts
mc.disconnect();
```

---

## Local Persistence (IndexedDB)

MindCache 2.4+ supports local browser persistence using IndexedDB. Data is automatically saved and loaded across page reloads.

### Basic Usage

```typescript
import { MindCache } from 'mindcache';

const mc = new MindCache({
  indexedDB: {
    dbName: 'my-app-db',      // Database name
    storeName: 'my-store',     // Object store name
    debounceMs: 500            // Delay before saving (batches writes)
  }
});

// Wait for data to load from IndexedDB
await mc.waitForSync();

// Now use normally - changes auto-save
mc.set_value('userName', 'Alice');
mc.set_value('preferences', { theme: 'dark' });

// On page reload, data is automatically restored
```

### Configuration Options

```typescript
interface IndexedDBConfig {
  dbName?: string;      // Default: 'mindcache_db'
  storeName?: string;   // Default: 'mindcache_store'
  key?: string;         // Default: 'mindcache_data'
  debounceMs?: number;  // Default: 1000
}
```

### When to Use IndexedDB vs Cloud

| Feature | IndexedDB | Cloud |
|---------|-----------|-------|
| Persistence | Local browser only | Across devices |
| Offline support | Yes | Requires connection |
| Multi-device sync | No | Yes |
| Collaboration | No | Yes |
| Setup complexity | None | Requires API keys |

**Important:** Cloud and IndexedDB are mutually exclusive. Attempting to use both throws an error:

```typescript
// ❌ This will throw an error!
const mc = new MindCache({
  cloud: { instanceId: 'xxx', apiKey: 'xxx', baseUrl: 'xxx' },
  indexedDB: { dbName: 'my-db' }
});
// Error: Cannot use both cloud and indexedDB together
```

---

## React Hook - useMindCache

The `useMindCache` hook is the simplest way to use MindCache in React applications. It handles async initialization, loading state, and cleanup automatically.

### Basic Usage

```tsx
'use client';
import { useMindCache } from 'mindcache';

function MyComponent() {
  const { mindcache, isLoaded, error } = useMindCache({
    indexedDB: { dbName: 'my-app' }
  });

  if (!isLoaded) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Hello, {mindcache.get_value('userName')}</h1>
      <button onClick={() => mindcache.set_value('userName', 'Bob')}>
        Change Name
      </button>
    </div>
  );
}
```

### Hook Return Type

```typescript
interface UseMindCacheResult {
  mindcache: MindCache | null;  // null until loaded
  isLoaded: boolean;             // true when ready
  error: Error | null;           // initialization error
}
```

### With Cloud Sync

```tsx
const { mindcache, isLoaded } = useMindCache({
  cloud: {
    instanceId: 'my-instance',
    tokenEndpoint: '/api/ws-token',
    baseUrl: 'https://api.mindcache.dev'
  }
});
```

### With Key Initialization

```tsx
function FormComponent() {
  const { mindcache, isLoaded } = useMindCache({
    indexedDB: { dbName: 'form-data' }
  });
  const [keysReady, setKeysReady] = useState(false);

  useEffect(() => {
    if (!isLoaded || !mindcache) return;

    // Initialize default keys after load
    if (!mindcache.has('name')) {
      mindcache.set_value('name', '', { readonly: false });
    }
    if (!mindcache.has('email')) {
      mindcache.set_value('email', '', { readonly: false });
    }

    setKeysReady(true);
  }, [isLoaded, mindcache]);

  if (!isLoaded || !keysReady) return <Loading />;

  return <Form mindcache={mindcache} />;
}
```

### What the Hook Handles

1. **Async Initialization** - Creates MindCache instance and waits for `waitForSync()`
2. **React StrictMode** - Prevents double initialization in development
3. **Loading State** - Returns `isLoaded: false` until fully initialized
4. **Error Handling** - Catches initialization errors
5. **Cleanup** - Calls `disconnect()` on unmount

---

## Integration Patterns

### Next.js API Route

```typescript
// pages/api/chat.ts or app/api/chat/route.ts
import { MindCache } from 'mindcache';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, instanceId } = await req.json();

  // Connect to user's MindCache instance
  const mc = new MindCache({
    cloud: {
      instanceId,
      apiKey: process.env.MINDCACHE_API_KEY,
    }
  });

  await mc.waitForSync();

  // Generate response with tools
  const result = await streamText({
    model: openai('gpt-4'),
    tools: mc.get_aisdk_tools(),
    system: mc.get_system_prompt(),
    messages,
  });

  mc.disconnect();

  return result.toAIStreamResponse();
}
```

### React Context Provider

```typescript
// MindCacheProvider.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { MindCache } from 'mindcache';

const MindCacheContext = createContext<MindCache | null>(null);

export function MindCacheProvider({ instanceId, children }) {
  const [mc, setMc] = useState<MindCache | null>(null);

  useEffect(() => {
    const instance = new MindCache({
      cloud: { instanceId, tokenEndpoint: '/api/ws-token' }
    });
    setMc(instance);
    return () => instance.disconnect();
  }, [instanceId]);

  if (!mc?.isLoaded) return <div>Loading...</div>;

  return (
    <MindCacheContext.Provider value={mc}>
      {children}
    </MindCacheContext.Provider>
  );
}

export function useMindCache() {
  const mc = useContext(MindCacheContext);
  if (!mc) throw new Error('useMindCache must be used within MindCacheProvider');
  return mc;
}
```

### Form State Management

```typescript
// Track form state for AI assistance
function SmartForm() {
  const mc = useMindCache();

  const handleChange = (field: string, value: string) => {
    mc.set_value(`form_${field}`, value, { tags: ['form'] });
  };

  return (
    <form>
      <input
        onChange={(e) => handleChange('name', e.target.value)}
        value={mc.get_value('form_name') || ''}
      />
      <input
        onChange={(e) => handleChange('email', e.target.value)}
        value={mc.get_value('form_email') || ''}
      />
    </form>
  );
}

// AI can now see form state and help the user
// System prompt will include: form_name: ..., form_email: ...
```

---

## Common Use Cases

### AI Agent Memory

```typescript
// Store conversation context
mindcache.set_value('userName', 'Alice', { tags: ['context'] });
mindcache.set_value('currentTask', 'Planning vacation', { tags: ['context'] });
mindcache.set_value('preferences', { budget: 'medium', style: 'adventure' });

// AI can read context and update as conversation progresses
const tools = mindcache.get_aisdk_tools();
const systemPrompt = `
You are a travel planning assistant.
${mindcache.getTagged('context')}
Help the user plan their vacation based on their preferences.
`;
```

### Multi-Step Workflow

```typescript
// Step 1: User provides input
mindcache.set_value('input_topic', 'renewable energy');

// Step 2: AI researches
// (AI calls write_research_results via tool)
mindcache.set_value('research_results', '...');

// Step 3: AI summarizes
const summary = mindcache.injectSTM(`
Based on research about {{input_topic}}:
{{research_results}}

Please create a summary.
`);

// Step 4: Store final output
mindcache.set_value('final_summary', summary);
```

### Collaborative Editing

```typescript
// Multiple clients connected to same instance
const mc = new MindCache({
  cloud: { instanceId: 'shared-doc-123', tokenEndpoint: '/api/ws-token' }
});

// Listen for changes from other editors
mc.subscribeToAll(() => {
  updateUI(mc.getAll());
});

// Local changes sync automatically to other clients
mc.set_value('paragraph_1', 'Updated text...');
```

### AI-Assisted Data Entry

```typescript
// Store structured data
mindcache.set_value('customer_name', '', { tags: ['customer'] });
mindcache.set_value('customer_email', '', { tags: ['customer'] });
mindcache.set_value('customer_phone', '', { tags: ['customer'] });

// AI can fill in data from natural language
// User: "The customer is John Smith, john@example.com, 555-1234"
// AI calls: write_customer_name('John Smith')
//           write_customer_email('john@example.com')
//           write_customer_phone('555-1234')
```

---

## Error Handling

### Common Errors

```typescript
// Key not found
const value = mindcache.get_value('nonexistent');
// Returns: undefined (not an error)

// Always check for undefined
const userName = mindcache.get_value('userName') ?? 'Guest';
```

### Cloud Connection Errors

```typescript
const mc = new MindCache({
  cloud: { instanceId: 'invalid-id', tokenEndpoint: '/api/ws-token' }
});

// Check connection state
if (mc.connectionState === 'error') {
  console.error('Failed to connect to cloud');
}

// Wait for sync with timeout
const timeout = setTimeout(() => {
  console.error('Sync taking too long');
}, 10000);

await mc.waitForSync();
clearTimeout(timeout);
```

### Handling Tool Execution Errors

```typescript
import { generateText } from 'ai';

try {
  const { text, toolCalls } = await generateText({
    model: openai('gpt-4'),
    tools: mindcache.get_aisdk_tools(),
    system: mindcache.get_system_prompt(),
    prompt: userMessage,
  });
} catch (error) {
  if (error.message.includes('tool')) {
    console.error('Tool execution failed:', error);
    // Handle tool-specific errors
  }
  throw error;
}
```

---

## TypeScript Types

### Core Types

```typescript
interface KeyAttributes {
  readonly?: boolean;
  visible?: boolean;
  hardcoded?: boolean;
  template?: boolean;
  tags?: string[];
}

interface KeyEntry {
  value: any;
  attributes: KeyAttributes;
  type?: 'text' | 'json' | 'image' | 'file';
  contentType?: string; // MIME type for images/files
}

interface MindCacheCloudOptions {
  instanceId: string;
  tokenEndpoint?: string;  // For browser auth
  apiKey?: string;         // For server auth
  baseUrl?: string;        // Custom API URL
}

interface MindCacheOptions {
  cloud?: MindCacheCloudOptions;
}
```

### MindCache Class

```typescript
class MindCache {
  constructor(options?: MindCacheOptions);

  // Core operations
  set_value(key: string, value: any, attributes?: KeyAttributes): void;
  get_value(key: string): any;
  delete(key: string): void;
  has(key: string): boolean;
  clear(): void;
  getAll(): Record<string, KeyEntry>;

  // Attributes
  set_attributes(key: string, attributes: KeyAttributes): void;
  get_attributes(key: string): KeyAttributes | undefined;

  // Tags
  addTag(key: string, tag: string): void;
  removeTag(key: string, tag: string): void;
  getTags(key: string): string[];
  hasTag(key: string, tag: string): boolean;
  getTagged(tag: string): string;

  // Templates
  injectSTM(template: string): string;

  // LLM Integration
  get_system_prompt(): string;
  get_aisdk_tools(): Record<string, Tool>;
  getSTM(): string;

  // Serialization
  toJSON(): string;
  fromJSON(json: string): void;
  toMarkdown(): string;
  fromMarkdown(markdown: string): void;
  serialize(): object;
  deserialize(data: object): void;

  // Binary data
  add_image(key: string, base64Data: string, mimeType: string): void;
  set_base64(key: string, base64Data: string, mimeType: string, type: 'file' | 'image'): void;
  get_data_url(key: string): string;

  // Events
  subscribe(key: string, listener: (value: any) => void): void;
  unsubscribe(key: string, listener: (value: any) => void): void;
  subscribeToAll(listener: () => void): void;
  unsubscribeFromAll(listener: () => void): void;

  // Cloud-specific (when cloud option is set)
  readonly connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  readonly isLoaded: boolean;
  readonly isCloud: boolean;
  waitForSync(): Promise<void>;
  disconnect(): void;
}
```

---

## Quick Reference

### Most Common Operations

```typescript
import { mindcache } from 'mindcache';

// Set value
mindcache.set_value('key', 'value');
mindcache.set_value('key', 'value', { readonly: true, tags: ['tag1'] });

// Get value
const value = mindcache.get_value('key');

// Check existence
if (mindcache.has('key')) { ... }

// Delete
mindcache.delete('key');

// Get all
const all = mindcache.getAll();

// Template injection
const result = mindcache.injectSTM('Hello {{name}}!');

// LLM tools
const tools = mindcache.get_aisdk_tools();
const prompt = mindcache.get_system_prompt();

// Tags
mindcache.addTag('key', 'tagName');
const tagged = mindcache.getTagged('tagName');

// Update attributes only (v3.2+)
mindcache.set_attributes('key', { tags: ['new-tag'] });

// Events
mindcache.subscribe('key', (value) => console.log(value));
mindcache.subscribeToAll(() => console.log('changed'));

// Serialization
const json = mindcache.toJSON();
mindcache.fromJSON(json);
```

### Cloud Quick Reference

```typescript
import { MindCache } from 'mindcache';

// Pattern 1: Secure (Production) - tokenEndpoint
const mc = new MindCache({
  cloud: {
    instanceId: 'xxx',
    baseUrl: 'https://api.mindcache.dev',
    tokenEndpoint: '/api/ws-token'  // Your backend handles API key
  }
});

// Pattern 2: Simple (Demos) - apiKey directly
const mc = new MindCache({
  cloud: {
    instanceId: 'xxx',
    apiKey: 'del_xxx:sec_xxx',  // Or mc_live_xxx
    baseUrl: 'https://api.mindcache.dev'
  }
});

// Wait for sync (IMPORTANT!)
await mc.waitForSync();

// Check state
mc.connectionState; // 'connected'
mc.isLoaded;        // true
mc.isCloud;         // true

// Cleanup
mc.disconnect();
```

---

## Complete App Examples

### Example 1: Simple Cloud Counter (Demo Pattern)

A minimal Next.js app with real-time counter sync. Uses Pattern 2 (apiKey in browser).

**File: `src/app/page.tsx`**
```typescript
"use client";
import { useState, useEffect, useRef } from 'react';
import { MindCache } from 'mindcache';

export default function Home() {
  const [instanceId, setInstanceId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const mindCacheRef = useRef<MindCache | null>(null);

  const handleConnect = async () => {
    if (!instanceId || !apiKey) return;

    const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL;
    if (!baseUrl) throw new Error('NEXT_PUBLIC_MINDCACHE_API_URL not set');

    // SDK automatically fetches token using apiKey
    const mc = new MindCache({
      cloud: {
        instanceId,
        apiKey,
        baseUrl
      }
    });

    await mc.waitForSync();
    
    const current = mc.get_value('counter');
    setCount(Number(current) || 0);

    mc.subscribe('counter', (val: any) => {
      setCount(Number(val) || 0);
    });

    mindCacheRef.current = mc;
    setConnected(true);
  };

  // Auto-increment every second
  useEffect(() => {
    if (!connected || !mindCacheRef.current) return;
    const interval = setInterval(() => {
      const mc = mindCacheRef.current!;
      const next = (Number(mc.get_value('counter')) || 0) + 1;
      mc.set_value('counter', next);
    }, 1000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <div>
      {!connected ? (
        <div>
          <input value={instanceId} onChange={e => setInstanceId(e.target.value)} placeholder="Instance ID" />
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API Key" />
          <button onClick={handleConnect}>Connect</button>
        </div>
      ) : (
        <div>Counter: {count}</div>
      )}
    </div>
  );
}
```

**File: `.env.local`**
```bash
NEXT_PUBLIC_MINDCACHE_API_URL=https://api.mindcache.dev
```

---

### Example 2: Production Cloud Form (Secure Pattern)

A production-ready Next.js app with AI chat. Uses Pattern 1 (tokenEndpoint).

**File: `src/app/api/ws-token/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.MINDCACHE_API_KEY; // Server-side secret!
  const apiUrl = process.env.MINDCACHE_API_URL || 'https://api.mindcache.dev';
  const instanceId = request.nextUrl.searchParams.get('instanceId');

  if (!apiKey || !instanceId) {
    return NextResponse.json({ error: 'Missing config' }, { status: 500 });
  }

  // Determine auth header format based on key type
  const isDelegate = apiKey.startsWith('del_') && apiKey.includes(':');
  const authHeader = isDelegate ? `ApiKey ${apiKey}` : `Bearer ${apiKey}`;

  const response = await fetch(`${apiUrl}/api/ws-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({ instanceId, permission: 'write' })
  });

  const tokenData = await response.json();
  return NextResponse.json(tokenData);
}
```

**File: `src/components/CloudForm.tsx`**
```typescript
'use client';
import { useRef, useEffect, useState } from 'react';
import { MindCache } from 'mindcache';

interface Props {
  instanceId: string;
}

export default function CloudForm({ instanceId }: Props) {
  const mcRef = useRef<MindCache | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  // Initialize MindCache once
  if (!mcRef.current && instanceId) {
    mcRef.current = new MindCache({
      cloud: {
        instanceId,
        baseUrl: process.env.NEXT_PUBLIC_MINDCACHE_API_URL,
        tokenEndpoint: '/api/ws-token' // Uses our backend route
      }
    });
  }

  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;

    const handleChange = () => {
      setIsLoaded(mc.isLoaded);
      if (mc.isLoaded) {
        setFormData({
          name: mc.get_value('name') || '',
          email: mc.get_value('email') || ''
        });
      }
    };

    handleChange();
    mc.subscribeToAll(handleChange);

    return () => {
      mc.unsubscribeFromAll(handleChange);
      mc.disconnect();
    };
  }, [instanceId]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mcRef.current?.set_value(field, value);
  };

  if (!isLoaded) return <div>Loading...</div>;

  return (
    <form>
      <input
        value={formData.name}
        onChange={e => handleInputChange('name', e.target.value)}
        placeholder="Name"
      />
      <input
        value={formData.email}
        onChange={e => handleInputChange('email', e.target.value)}
        placeholder="Email"
      />
    </form>
  );
}
```

**File: `.env.local`**
```bash
# Server-side only (never exposed)
MINDCACHE_API_KEY=del_xxx:sec_xxx

# Client-side (safe to expose)
NEXT_PUBLIC_MINDCACHE_API_URL=https://api.mindcache.dev
NEXT_PUBLIC_INSTANCE_ID=your-instance-id
```

---

## Best Practices Summary

1. **Always call `waitForSync()`** before reading cloud data
2. **Use `tokenEndpoint` for production** - keeps API key server-side
3. **Use `apiKey` for demos** - simpler but exposes key to browser
4. **Subscribe to changes** for real-time updates: `mc.subscribeToAll()`
5. **Disconnect on cleanup** in React useEffect return
6. **Check `isLoaded` before rendering** dependent UI
7. **Use `baseUrl`** - required, no default fallback
8. **Instance IDs are safe to expose** - they're just identifiers

---

*This documentation is optimized for LLM consumption. For human-readable documentation with interactive examples, visit [mindcache.dev](https://mindcache.dev).*

