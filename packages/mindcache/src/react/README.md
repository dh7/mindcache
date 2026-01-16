# MindCache React Components

Local-first AI chat components with zero server required.

## Quick Start

```tsx
import { MindCacheProvider, MindCacheChat } from 'mindcache';

function App() {
  return (
    <MindCacheProvider
      ai={{
        provider: 'openai',
        model: 'gpt-4o',
        keyStorage: 'localStorage'
      }}
    >
      <MindCacheChat />
    </MindCacheProvider>
  );
}
```

That's it! The chat component handles:
- API key input (prompts user if not set)
- Real-time streaming responses
- MindCache tool integration
- Mobile-friendly UI

## Components

### `<MindCacheProvider>`

Wraps your app and provides MindCache + AI configuration.

```tsx
<MindCacheProvider
  mindcache={{
    indexedDB: {
      dbName: 'my-app',
      storeName: 'mindcache'
    }
  }}
  ai={{
    provider: 'openai',      // Built-in: 'openai' | 'anthropic'
    model: 'gpt-4o',         // Any model supported by provider
    keyStorage: 'localStorage',
    storageKey: 'my_api_key' // Optional custom key name
  }}
  sync={{
    gitstore: {
      owner: 'username',
      repo: 'my-data',
      token: 'ghp_...'
    }
  }}
>
  {children}
</MindCacheProvider>
```

### `<MindCacheChat>`

Pre-built chat UI component.

```tsx
<MindCacheChat
  welcomeMessage="Hello! How can I help?"
  placeholder="Type a message..."
  theme={{
    background: '#000',
    textColor: '#fff',
    primaryColor: '#22c55e'
  }}
/>
```

## Hooks

### `useMindCacheContext()`

Access MindCache and AI configuration.

```tsx
const { 
  mindcache,    // MindCache instance
  isLoaded,     // Ready to use?
  hasApiKey,    // API key configured?
  setApiKey,    // Set API key
  getModel,     // Get AI model instance
  syncToGitStore // Manual sync to GitHub
} = useMindCacheContext();
```

### `useClientChat()`

Build custom chat UI.

```tsx
const {
  messages,
  sendMessage,
  isLoading,
  error,
  streamingContent,
  stop
} = useClientChat({
  systemPrompt: 'You are a helpful assistant.',
  maxToolCalls: 5,
  onFinish: (message) => console.log('Done:', message),
  onMindCacheChange: () => console.log('MindCache updated')
});
```

### `useLocalFirstSync()`

Sync MindCache to GitHub.

```tsx
const { 
  status,        // 'idle' | 'loading' | 'saving' | 'error'
  lastSyncAt,
  hasLocalChanges,
  save,          // Manual save
  load,          // Manual load
  sync           // Load then save
} = useLocalFirstSync({
  mindcache,
  gitstore: {
    owner: 'me',
    repo: 'data',
    token: async () => getToken()
  },
  autoSyncInterval: 30000,
  saveDebounceMs: 5000
});
```

## Custom AI Provider

For providers not built-in, use `modelProvider`:

```tsx
import { createAnthropic } from '@ai-sdk/anthropic';

<MindCacheProvider
  ai={{
    keyStorage: 'localStorage',
    modelProvider: (apiKey) => {
      const anthropic = createAnthropic({ apiKey });
      return anthropic('claude-3-5-sonnet-20241022');
    }
  }}
>
```

## Architecture

```
Browser
├── MindCache (IndexedDB)     ← Local persistence
├── AI SDK (streamText)       ← Streaming responses
└── OpenAI/Anthropic API      ← Direct API calls
```

No server required. API keys stored in browser localStorage.
