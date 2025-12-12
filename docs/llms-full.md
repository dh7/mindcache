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
14. [Integration Patterns](#integration-patterns)
15. [Common Use Cases](#common-use-cases)
16. [Error Handling](#error-handling)
17. [TypeScript Types](#typescript-types)

---

## Overview

MindCache is a TypeScript library for managing short-term memory in AI agents. It provides:

- **Key-value storage** optimized for LLM consumption
- **Automatic tool generation** for Vercel AI SDK integration
- **System prompt generation** with memory context
- **Template injection** with `{{key}}` syntax
- **Cloud sync** with real-time collaboration (v2.0+)

### When to Use MindCache

✅ **Good for:**
- AI agent memory during conversations
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

MindCache 2.0+ supports cloud persistence and real-time sync.

### Connecting to Cloud

```typescript
import { MindCache } from 'mindcache';

// Create cloud-connected instance
const mc = new MindCache({
  cloud: {
    instanceId: 'my-instance-id',      // Get from app.mindcache.dev
    tokenEndpoint: '/api/ws-token',    // Your API endpoint for auth
  }
});

// Same API as local!
mc.set_value('userName', 'Alice');
```

### Connection States

```typescript
// Check connection state
console.log(mc.connectionState);
// 'disconnected' | 'connecting' | 'connected' | 'error'

// Check if initial sync is complete
console.log(mc.isLoaded);
// true when all cloud data is loaded

// Check if instance is cloud-connected
console.log(mc.isCloud);
// true
```

### Real-Time Sync

```typescript
// Subscribe to sync events
mc.subscribeToAll(() => {
  console.log('Data synced from cloud!');
});

// Changes from other clients appear automatically
// No polling needed - WebSocket-based real-time updates
```

### Disconnecting

```typescript
// Clean disconnect when done
mc.disconnect();
```

### Server-Side Usage

```typescript
// On server, use API key directly (never expose in browser!)
const mc = new MindCache({
  cloud: {
    instanceId: 'my-instance-id',
    apiKey: process.env.MINDCACHE_API_KEY, // Server-only!
  }
});

await mc.waitForSync(); // Wait for initial data load
const data = mc.get_value('important');
mc.disconnect();
```

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

// Browser
const mc = new MindCache({
  cloud: { instanceId: 'xxx', tokenEndpoint: '/api/ws-token' }
});

// Server
const mc = new MindCache({
  cloud: { instanceId: 'xxx', apiKey: process.env.MINDCACHE_API_KEY }
});

// Wait for sync
await mc.waitForSync();

// Check state
mc.connectionState; // 'connected'
mc.isLoaded;        // true
mc.isCloud;         // true

// Cleanup
mc.disconnect();
```

---

*This documentation is optimized for LLM consumption. For human-readable documentation with interactive examples, visit [mindcache.dev](https://mindcache.dev).*
