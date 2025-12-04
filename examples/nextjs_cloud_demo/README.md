# MindCache Cloud Demo

A Next.js example demonstrating MindCache Cloud sync with real-time collaboration.

## Features

- **Form Example**: Cloud-synced form fields with AI assistant
- **Image Example**: Upload, analyze, and generate images stored in the cloud
- **Workflow Example**: Multi-step tweet generation workflow with cloud persistence
- **MindCache Editor**: Full STM editor with cloud sync and real-time collaboration

## Key Differences from Client Demo

| Feature | Client Demo | Cloud Demo |
|---------|-------------|------------|
| Storage | localStorage | MindCache Cloud |
| Sync | Manual Save/Load | Real-time auto-sync |
| Collaboration | Single user | Multi-user real-time |
| Persistence | Browser-only | Cloud-persistent |

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   
   Copy `env.example` to `.env.local` and fill in your credentials:
   ```bash
   cp env.example .env.local
   ```

   Required variables:
   - `MINDCACHE_API_KEY` - Your MindCache Cloud API key
   - `MINDCACHE_INSTANCE_ID` - Your MindCache instance ID
   - `MINDCACHE_PROJECT_ID` - Your MindCache project ID
   - `OPENAI_API_KEY` - For chat and image analysis
   - `FIREWORKS_API_KEY` - For image generation/editing

   For client-side cloud connection, also add:
   - `NEXT_PUBLIC_MINDCACHE_API_KEY`
   - `NEXT_PUBLIC_MINDCACHE_INSTANCE_ID`
   - `NEXT_PUBLIC_MINDCACHE_PROJECT_ID`

3. **Get MindCache Cloud credentials:**
   - Go to [mindcache.io](https://mindcache.io)
   - Create a project
   - Create an instance
   - Generate an API key

4. **Run the development server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001) in your browser.

## Cloud Connection

The demo automatically connects to MindCache Cloud when credentials are provided. You'll see connection status indicators:

- ● Green: Connected and syncing
- ◐ Yellow: Connecting...
- ✕ Red: Connection error
- ○ Gray: Disconnected

## Usage

### Form Example
Type form data or ask the AI to fill it in. Data syncs automatically to the cloud.

### Image Example
Upload an image or generate one with AI. Ask the AI to analyze or edit images.

### Workflow Example
Fill in Topic, Company, and Audience fields, then run the workflow to automatically:
1. Research the topic
2. Research the company
3. Generate tweet text
4. Create a tweet image

### MindCache Editor
Full-featured STM editor with:
- Add/edit/delete keys
- Tag filtering
- Export/Import markdown
- Real-time cloud sync

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Browser       │     │  Other Clients  │
│   (Next.js)     │     │                 │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │  WebSocket            │
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           MindCache Cloud               │
│   (Real-time sync & persistence)        │
└─────────────────────────────────────────┘
```

## Local Mode

If cloud credentials are not configured, the demo falls back to local-only mode (no sync, data in memory only).

