# Local-First Chat

A minimal example of a **100% client-side** AI chat app using MindCache.

## Features

- **No server required** - AI calls go directly from browser to OpenAI
- **API key in localStorage** - Never sent to any server
- **Data in IndexedDB** - Persists locally, works offline
- **Real-time streaming** - See responses as they generate
- **MindCache integration** - AI can read/write to your local data

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your OpenAI API key when prompted.

## How It Works

```tsx
// layout.tsx - Configure the provider (just 3 lines of config!)
<MindCacheProvider
  ai={{
    provider: 'openai',
    model: 'gpt-4o',
    keyStorage: 'localStorage'
  }}
>
  {children}
</MindCacheProvider>

// page.tsx - Use the chat component
<MindCacheChat
  welcomeMessage="Hello!"
  placeholder="Ask anything..."
/>
```

That's it! ~15 lines of code for a full AI chat app.

## Architecture

```
Browser
├── MindCache (IndexedDB)     ← Local data persistence
├── AI SDK (streamText)       ← Streaming AI responses
└── OpenAI API               ← Direct API calls (no proxy)
```

## Adding MindCache Data

The AI can read and write to MindCache. Set up some initial data:

```tsx
const { mindcache } = useMindCacheContext();

// Add data the AI can see and modify
mindcache.set_value('user_name', 'Alice', {
  systemTags: ['SystemPrompt', 'LLMWrite']
});
```

Now ask the AI: "What's my name?" or "Change my name to Bob"
