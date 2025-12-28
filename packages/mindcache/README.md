# MindCache

A TypeScript library for managing short-term memory in AI agents through an LLM-friendly key-value repository.

## Documentation

*   **[API Reference](./docs/mindcache-api.md)**: Detailed method signatures and type definitions. Optimized for AI agents (like Cursor, Claude, etc.) to understand the library's capabilities.
*   **[Full Documentation](https://mindcache.dev/llms-full.md)**: Comprehensive guide with examples and deep dives.

## Quick Start

```typescript
import { mindcache } from 'mindcache';

// Store values
mindcache.set_value('userName', 'Alice');

// Generate tools for Vercel AI SDK
const tools = mindcache.get_aisdk_tools();
```

See the [root README](../../README.md) for more details.
