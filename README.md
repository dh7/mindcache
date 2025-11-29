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

### Attributes & Metadata
```typescript
// Set with attributes
mindcache.set_value('apiKey', 'secret123', {
  readonly: true,
  visible: false,
  tags: ['credentials']
});

// Mark as template for dynamic resolution
mindcache.set_value('greeting', 'Hello {{name}}!', {
  template: true
});
```

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

### Temporal Context
Built-in `$date` and `$time` keys provide current date and time:
```typescript
mindcache.get('$date'); // "2025-01-15"
mindcache.get('$time'); // "14:30:00"
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
- `fromMarkdown(markdown)` - Import from markdown format
- `serialize()` - Get complete state object
- `deserialize(data)` - Restore complete state

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
