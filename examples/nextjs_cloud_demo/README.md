# MindCache Cloud Demo

A Next.js example demonstrating MindCache Cloud with real-time sync and project-based instance management.

## Features

- **Project-based**: Connects to a MindCache project, auto-creates instances for each demo
- **4 Demo Types**: Form, Image, Workflow, MindCache Editor - each with its own cloud instance
- **Real-time Sync**: Changes sync instantly via WebSocket
- **AI Chat**: Uses MindCache Cloud's `/api/chat` with built-in tools

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get MindCache Cloud credentials

1. Go to [mindcache.io](https://mindcache.io)
2. Create a project
3. Go to Settings > API Keys
4. Generate a new API key **scoped to your project**

### 3. Configure environment

```bash
cp env.example .env.local
```

Fill in:

```env
MINDCACHE_API_KEY=mc_live_xxxxx
MINDCACHE_PROJECT_ID=your_project_id

NEXT_PUBLIC_MINDCACHE_API_KEY=mc_live_xxxxx
NEXT_PUBLIC_MINDCACHE_PROJECT_ID=your_project_id
NEXT_PUBLIC_MINDCACHE_API_URL=https://mindcache-api.dh7777777.workers.dev
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## How It Works

### Instance Management

On first load, the app:
1. Fetches existing instances from your project
2. Creates any missing demo instances (`form`, `image`, `workflow`, `mindcache-editor`)
3. Each demo connects to its dedicated instance

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App                          │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Form   │ │  Image  │ │ Workflow │ │ MC Editor   │  │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └──────┬──────┘  │
│       │           │           │              │          │
│       ▼           ▼           ▼              ▼          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Instance Provider                   │   │
│  │   Maps demo names → instance IDs                │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    WebSocket (sync)              HTTP APIs (chat, images)
            │                               │
            └───────────┬───────────────────┘
                        ▼
    ┌─────────────────────────────────────────────────────┐
    │              MindCache Cloud                        │
    │  ┌────────────────────────────────────────────────┐│
    │  │                  Project                        ││
    │  │  ┌──────┐ ┌──────┐ ┌────────┐ ┌─────────────┐ ││
    │  │  │ form │ │image │ │workflow│ │mc-editor    │ ││
    │  │  └──────┘ └──────┘ └────────┘ └─────────────┘ ││
    │  │         (Durable Objects)                      ││
    │  └────────────────────────────────────────────────┘│
    └─────────────────────────────────────────────────────┘
```

### AI Chat

Each demo's chat uses MindCache Cloud's `/api/chat`:
- Reads context from `SystemPrompt`-tagged keys
- Built-in tools: `read_key`, `write_key`, `delete_key`, `list_keys`
- Two modes: `use` (default) and `edit`

## Connection Status

- ● Green: Connected and syncing
- ◐ Yellow: Connecting...
- ✕ Red: Error
- ○ Gray: Disconnected
