# Simple Cloud Counter

A simple Next.js example demonstrating real-time cloud sync with MindCache.

## Features

- Connects to MindCache Cloud using Instance ID and API Key
- Auto-increments a "counter" key every second
- Syncs state in real-time across all connected clients
- **No backend route needed** - SDK handles token exchange automatically

## How It Works

The MindCache SDK simplifies authentication:

1. You provide `instanceId` and `apiKey` to MindCache
2. SDK automatically calls `api.mindcache.dev/api/ws-token` to get a short-lived token
3. SDK connects to WebSocket using the token
4. Data syncs in real-time!

```typescript
const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    apiKey: 'mc_live_xxx',
    baseUrl: 'https://api.mindcache.dev'
  }
});

await mc.waitForSync();
mc.set_value('counter', 1);  // Synced to cloud instantly!
```

## Setup

1. Set your MindCache API URL in `.env.local`:
   ```
   NEXT_PUBLIC_MINDCACHE_API_URL=https://api.mindcache.dev
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3001](http://localhost:3001)

5. Enter your MindCache Instance ID and API Key to start

## Security Note

For production apps where you want to keep API keys server-side, use the `tokenEndpoint` pattern instead (see `nextjs_cloud_demo` example).
