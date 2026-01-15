# MindCache

A TypeScript library for managing short-term memory in AI agents through an LLM-friendly key-value repository.

## Documentation

*   **[API Reference](./docs/mindcache-api.md)**: Detailed method signatures and type definitions. Optimized for AI agents (like Cursor, Claude, etc.) to understand the library's capabilities.
*   **[Full Documentation](https://mindcache.dev/llms-full.md)**: Comprehensive guide with examples and deep dives.

## Quick Start

```typescript
import { MindCache } from 'mindcache';

const mc = new MindCache();

// Store values with LLM access
mc.set_value('userName', 'Alice', { 
  systemTags: ['SystemPrompt', 'LLMRead', 'LLMWrite'] 
});

// Generate tools for Vercel AI SDK
const tools = mc.create_vercel_ai_tools();

// Or for other frameworks (OpenAI, Anthropic, LangChain)
const rawTools = mc.create_tools();
```

## Custom Types (v3.6+)

Define structured schemas for consistent LLM output:

```typescript
// Register a custom type with Markdown schema
mc.registerType('Contact', `
#Contact
* name: full name
* email: email address
* phone: phone number
`);

// Assign type to a key
mc.set_value('contact_alice', JSON.stringify({ name: 'Alice' }));
mc.setType('contact_alice', 'Contact');
```

See the [root README](../../README.md) for more details.
