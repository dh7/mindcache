# MindCache

A TypeScript library for managing short-term memory in AI agents through an LLM-friendly key-value repository.

## Motivation

MindCache was born from three core motivations:

1. **Learning by Doing**: Building real-world AI agent applications reveals patterns and challenges that theoretical knowledge alone cannot provide. This library captures those learnings.

2. **Code Mutualization**: Instead of rewriting memory management logic for each project, MindCache provides a shared foundation that can be reused across various AI agent applications.

3. **Pattern Discovery**: Through practical use, MindCache explores and implements patterns that are essential for effective context window management and tools orchestration in AI systems.

## What Problem Does It Solve?

AI agents need to maintain context during conversations and across tool calls. MindCache provides:

- **Short-term memory management** for session-based context
- **LLM-optimized storage** that agents can easily read and write
- **Automatic tool generation** so agents can interact with memory without manual tool definitions
- **System prompt generation** that summarizes memory state efficiently
- **Context window optimization** through visibility controls and smart formatting

> **Note**: Cross-session persistence is out of scope. MindCache focuses on short-term memory within a single session.

## Core Concepts

### Universal Storage
Store any data type an LLM can process: text, JSON, images, and files. All data is stored in an LLM-friendly format.

### LLM-Native Interface
- **Readable**: Memory is formatted for easy LLM consumption
- **Writable**: Agents can directly modify memory through automatically generated tools
- **Template Injection**: Use `{{key}}` syntax to inject memory values into prompts and templates

### Smart Context Management
- **Visibility Controls**: Mark keys as visible/invisible to control what appears in system prompts
- **Read-only Keys**: Protect certain values from modification
- **Tags**: Organize and filter memory entries by category
- **Templates**: Enable dynamic value resolution with circular reference protection

### Automatic Tool Generation
Tools are automatically generated for each writable key, allowing agents to read and write memory without manual tool definitions. Tools integrate seamlessly with Vercel AI SDK.

## Quick Start

```typescript
import { mindcache } from 'mindcache';

// Store values
mindcache.set_value('userName', 'Alice');
mindcache.set_value('favoriteColor', 'blue');

// Generate system prompt for your AI agent
const systemPrompt = mindcache.get_system_prompt();
// "userName: Alice. You can rewrite \"userName\" by using the write_userName tool..."

// Generate tools for Vercel AI SDK
const tools = mindcache.get_aisdk_tools();
// { write_userName: {...}, write_favoriteColor: {...} }

// Use with AI SDK
import { generateText } from 'ai';
const { text } = await generateText({
  model: openai('gpt-4'),
  tools: tools,
  system: systemPrompt,
  prompt: 'Remember that I love green now, not blue.'
});
// AI automatically calls write_favoriteColor('green')
```

## Key Features

### Template Injection
```typescript
mindcache.set_value('name', 'Alice');
mindcache.set_value('city', 'New York');

const message = mindcache.injectSTM('Hello {{name}} from {{city}}!');
// "Hello Alice from New York!"
```

### System Tags & Attributes
```typescript
// Control LLM access with systemTags
mindcache.set_value('userPrefs', '{"theme":"dark"}', {
  type: 'json',
  systemTags: ['SystemPrompt', 'LLMWrite']  // Visible in prompt, writable by LLM
});

// Mark as template for dynamic resolution
mindcache.set_value('greeting', 'Hello {{name}}!', {
  systemTags: ['ApplyTemplate']  // Templates are processed on read
});

### Image & File Support
```typescript
// Store images
mindcache.add_image('profilePic', base64Data, 'image/png');

// Store files
mindcache.set_base64('document', base64Data, 'application/pdf', 'file');

// Get as data URL
const imageUrl = mindcache.get_data_url('profilePic');
```

### Tag-Based Organization
```typescript
mindcache.set_value('userName', 'Alice', { tags: ['user'] });
mindcache.set_value('userRole', 'developer', { tags: ['user'] });
mindcache.set_value('tempNote', 'Meeting at 3pm'); // No tags

// Get only tagged entries
const userData = mindcache.getTagged('user');
// "userName: Alice, userRole: developer"
```

### Markdown Serialization
```typescript
// Export to markdown
const markdown = mindcache.toMarkdown();

// Import from markdown
mindcache.fromMarkdown(markdown);
```

### Context Filtering
```typescript
// Filter keys by tags during a session
mindcache.setContext({ includeTags: ['user'] });
mindcache.get_system_prompt(); // Only includes keys tagged 'user'
mindcache.clearContext(); // Remove filter

// Scoped context
mindcache.withContext({ includeTags: ['admin'] }, () => {
  const adminPrompt = mindcache.get_system_prompt();
});
```

## Integration

### Vercel AI SDK
```typescript
import { streamText } from 'ai';
import { mindcache } from 'mindcache';

const tools = mindcache.get_aisdk_tools();
const systemPrompt = mindcache.get_system_prompt();

const result = await streamText({
  model: openai('gpt-4'),
  tools: tools,
  system: systemPrompt,
  prompt: userMessage
});
```

### Next.js
See the [Next.js example](./examples/nextjs_demo) for a complete integration.

### Framework Agnostic
MindCache works in any TypeScript/JavaScript environment, including:
- Serverless functions
- Edge runtimes
- Browser applications
- Node.js servers

## Server-Side Usage

MindCache provides a dedicated server export for use in Node.js, Cloudflare Workers, Durable Objects, and other server environments.

### Server Import

```typescript
// Use the server-specific export (no browser dependencies)
import { MindCache } from 'mindcache/server';

const mc = new MindCache();
mc.set_value('key', 'value');
```

### Advanced: Injecting an Existing Yjs Document

For advanced server-side scenarios (e.g., Cloudflare Durable Objects, collaborative backends), you can inject an existing `Y.Doc` instance. This allows MindCache to operate directly on your authoritative document without creating a separate copy.

```typescript
import { MindCache } from 'mindcache/server';
import * as Y from 'yjs';

// Your existing Yjs document (e.g., from a Durable Object)
const existingDoc: Y.Doc = getYourYjsDocument();

// Create MindCache instance wrapping your document
const mc = new MindCache({
  doc: existingDoc,
  accessLevel: 'system' // Required for full access when using doc injection
});

// All operations now apply directly to existingDoc
mc.fromMarkdown(markdownContent);
mc.set_value('imported', true);

// Changes are reflected in the original document
// No need to sync - you're operating on the source of truth
```

### Use Cases for Server-Side MindCache

1. **Server-Side Import/Hydration**: Parse and import markdown content directly into your data store without network overhead.

2. **Background Processing**: Process or transform MindCache data in serverless functions or workers.

3. **AI Agent Backends**: Use MindCache in your AI service layer to manage agent memory server-side.

4. **Durable Object Integration**: Wrap your Durable Object's Yjs document with MindCache for a higher-level API.

### Example: Cloudflare Durable Object

```typescript
import { MindCache } from 'mindcache/server';
import * as Y from 'yjs';

export class MyDurableObject {
  private doc: Y.Doc;

  constructor(state: DurableObjectState) {
    this.doc = new Y.Doc();
  }

  // Create a MindCache instance for this request
  private getSDK(): MindCache {
    return new MindCache({
      doc: this.doc,
      accessLevel: 'system'
    });
  }

  async handleImport(markdown: string): Promise<void> {
    const sdk = this.getSDK();
    sdk.fromMarkdown(markdown);
    // Changes are now in this.doc
  }

  async getValue(key: string): Promise<string | undefined> {
    const sdk = this.getSDK();
    return sdk.get_value(key);
  }
}
```

## API Reference

### Core Methods
- `set_value(key, value, attributes?)` - Store a value with optional attributes
- `get_value(key)` - Retrieve a value (supports template processing)
- `delete(key)` - Remove a key-value pair
- `has(key)` - Check if a key exists
- `clear()` - Clear all memory

### Memory Management
- `get_system_prompt()` - Generate system prompt from visible keys
- `get_aisdk_tools()` - Generate tools for Vercel AI SDK
- `injectSTM(template)` - Inject memory values into template strings
- `getSTM()` - Get formatted string of all visible entries

### Serialization
- `toJSON()` - Serialize to JSON string
- `fromJSON(jsonString)` - Deserialize from JSON string
- `toMarkdown()` - Export to markdown format
- `fromMarkdown(markdown, merge?)` - Import from markdown format (merge=false clears first)
- `serialize()` - Get complete state object
- `deserialize(data)` - Restore complete state

### Context Filtering
- `setContext(rules)` - Filter keys by tags (includeTags, excludeTags)
- `clearContext()` - Remove context filter
- `withContext(rules, fn)` - Run function with temporary context
- `getContext()` - Get current context rules

### Attributes & Tags
- `set_attributes(key, attributes)` - Update key attributes
- `get_attributes(key)` - Get key attributes
- `addTag(key, tag)` - Add a tag to a key
- `removeTag(key, tag)` - Remove a tag from a key
- `getTags(key)` - Get all tags for a key
- `getTagged(tag)` - Get all entries with a specific tag

### Event System
- `subscribe(key, listener)` - Subscribe to changes for a specific key
- `unsubscribe(key, listener)` - Unsubscribe from key changes
- `subscribeToAll(listener)` - Subscribe to all changes
- `unsubscribeFromAll(listener)` - Unsubscribe from all changes

## Examples

See the [examples directory](./examples) for complete implementations:
- Form management with AI assistant
- Image processing workflows
- Multi-step workflows with memory persistence
- Client-side STM editor

## Installation

```bash
npm install mindcache
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Optional: `ai` package >= 3.0.0 for Vercel AI SDK integration

## License

MIT License - see [LICENSE](LICENSE) for details.
