# Local-First MindCache

A complete MindCache demo with AI chat and key-value editor - all running 100% client-side.

## Features

- **AI Chat** - Talk to an AI that can read and write your MindCache data
- **MindCache Editor** - View and edit all your stored data
- **Real-time Sync** - Changes from AI immediately appear in the editor
- **Persistent Storage** - All data saved to IndexedDB
- **No Server Required** - Everything runs in the browser

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your OpenAI API key when prompted.

## How It Works

### Layout (layout.tsx)
```tsx
<MindCacheProvider
  ai={{
    provider: 'openai',
    model: 'gpt-4o',
    keyStorage: 'localStorage'
  }}
>
  {children}
</MindCacheProvider>
```

### Page (page.tsx)
```tsx
const { mindcache, isLoaded } = useMindCacheContext();

return (
  <>
    <MindCacheChat 
      onMindCacheChange={handleSTMChange}
    />
    <STMEditor stmVersion={stmVersion} />
  </>
);
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
├─────────────────────┬───────────────────────────────┤
│   MindCacheChat     │       STMEditor               │
│   ┌───────────────┐ │   ┌───────────────────────┐   │
│   │ useClientChat │ │   │ useMindCacheContext   │   │
│   └───────┬───────┘ │   └───────────┬───────────┘   │
│           │         │               │               │
│           ▼         │               ▼               │
│   ┌───────────────────────────────────────────┐     │
│   │           MindCacheProvider               │     │
│   │  ┌─────────────┐    ┌─────────────────┐   │     │
│   │  │  MindCache  │◄───│   AI SDK        │   │     │
│   │  │  (IndexedDB)│    │  (streamText)   │   │     │
│   │  └─────────────┘    └────────┬────────┘   │     │
│   └──────────────────────────────│────────────┘     │
│                                  │                  │
└──────────────────────────────────│──────────────────┘
                                   ▼
                            OpenAI API
```

## Key Differences from nextjs_client_demo

| Feature | nextjs_client_demo | local_first_mindcache |
|---------|-------------------|----------------------|
| Chat | Custom ChatInterface + API route | `<MindCacheChat />` |
| AI Execution | Server-side API | Client-side `streamText` |
| Config | Manual modelProvider | `provider: 'openai'` |
| Lines of Code | ~1500+ | ~300 |
| Dependencies | Many | Just `mindcache` |

## Files

```
src/
├── app/
│   ├── layout.tsx      # MindCacheProvider setup
│   ├── page.tsx        # Main split-panel layout
│   └── globals.css     # Minimal styling
└── components/
    ├── STMEditor.tsx   # Key-value editor
    └── STMToolbar.tsx  # Add/Export/Import/Clear
```
