# MindCache OAuth Provider - "Sign in with MindCache"

Enable your users to authenticate with MindCache and get automatic data storage + sync.

## Quick Start

### 1. Register Your App

1. Go to [MindCache Dashboard](https://app.mindcache.dev) → Settings → OAuth Apps
2. Click "New App" and fill in:
   - **Name**: Your app name (shown to users)
   - **Redirect URIs**: Your callback URLs (e.g., `http://localhost:3000`)
   - **Scopes**: Permissions your app needs
3. Copy your **Client ID** and **Client Secret**

### 2. Add OAuth to Your App

```typescript
import { MindCache, OAuthClient } from 'mindcache';

// Create OAuth client
const oauth = new OAuthClient({
  clientId: 'mc_app_abc123',
  scopes: ['read', 'write']
});

// Check if already authenticated
if (oauth.isAuthenticated()) {
  initApp();
} else if (window.location.search.includes('code=')) {
  // Handle OAuth callback
  await oauth.handleCallback();
  initApp();
} else {
  // Show login button
  document.getElementById('login')!.onclick = () => oauth.authorize();
}

async function initApp() {
  // Get the auto-provisioned instance ID
  const instanceId = oauth.getInstanceId();
  
  // Create MindCache with OAuth token provider
  const mc = new MindCache({
    cloud: {
      instanceId: instanceId!,
      tokenProvider: oauth.tokenProvider
    }
  });
  
  // Wait for sync
  await new Promise(resolve => mc.onConnectionChange(s => s === 'connected' && resolve(true)));
  
  // Use MindCache as normal!
  mc.set_value('lastLogin', new Date().toISOString());
  console.log('User data:', mc.list_keys());
}
```

## API Reference

### OAuthClient

```typescript
const oauth = new OAuthClient({
  clientId: string;              // Required: Your app's client ID
  redirectUri?: string;          // Optional: Defaults to current URL
  scopes?: string[];             // Optional: Default ['read', 'write']
  authUrl?: string;              // Optional: Custom authorize endpoint
  tokenUrl?: string;             // Optional: Custom token endpoint
  usePKCE?: boolean;             // Optional: Default true (recommended)
});
```

#### Methods

| Method | Description |
|--------|-------------|
| `authorize(options?)` | Start OAuth flow (redirects user) |
| `handleCallback()` | Handle OAuth callback, exchange code for tokens |
| `isAuthenticated()` | Check if user has valid tokens |
| `getAccessToken()` | Get access token (auto-refreshes if needed) |
| `getInstanceId()` | Get auto-provisioned instance ID |
| `getUserInfo()` | Fetch user profile from MindCache |
| `logout()` | Revoke tokens and clear session |
| `tokenProvider` | Token function for MindCache cloud config |

### Scopes

| Scope | Description |
|-------|-------------|
| `read` | Read keys and values |
| `write` | Create and modify keys |
| `profile` | Access user's email and name |
| `admin` | Full access including system keys |
| `github_sync` | Sync with user's GitHub repos |

## How It Works

```
┌─────────────────┐     1. User clicks "Sign in"     ┌──────────────────┐
│   Your App      │ ──────────────────────────────▶  │  MindCache Auth  │
│                 │                                   │                  │
│                 │     2. User logs in (GitHub)      │  /oauth/consent  │
│                 │                                   │                  │
│                 │  ◀───────────────────────────────│                  │
│                 │     3. Redirect with code         │                  │
│                 │                                   │                  │
│                 │     4. Exchange code for tokens   │                  │
│ oauth.handle    │ ──────────────────────────────▶  │  /oauth/token    │
│   Callback()    │                                   │                  │
│                 │     5. Auto-provision instance    │                  │
│                 │  ◀───────────────────────────────│                  │
│                 │     access_token + instance_id    │                  │
│                 │                                   │                  │
│ new MindCache   │     6. Connect WebSocket          │                  │
│   ({cloud:...}) │ ──────────────────────────────▶  │  Durable Object  │
│                 │                                   │                  │
│                 │     7. Sync user's data           │                  │
│                 │  ◀─────────────────────────────▶ │                  │
└─────────────────┘                                   └──────────────────┘
```

## Security

### PKCE (Recommended)

OAuthClient uses PKCE (Proof Key for Code Exchange) by default. This prevents authorization code interception attacks and is **required for browser apps**.

```typescript
// PKCE is enabled by default
const oauth = new OAuthClient({ 
  clientId: 'mc_app_xxx',
  usePKCE: true  // Default
});
```

### Token Storage

Tokens are stored in localStorage with a configurable prefix:

```typescript
const oauth = new OAuthClient({
  clientId: 'mc_app_xxx',
  storagePrefix: 'my_app_oauth'  // Default: 'mindcache_oauth'
});
```

### Token Refresh

Access tokens expire after 1 hour. `getAccessToken()` automatically refreshes tokens when needed using the refresh token (valid for 30 days).

## Instance Isolation

Each OAuth app gets its own **isolated instance per user**:

- User's data in your app is separate from their other MindCache data
- Users cannot access other apps' data
- Instances are auto-created on first login
- Data is stored in a hidden "OAuth Apps" project

## Error Handling

```typescript
try {
  await oauth.handleCallback();
} catch (error) {
  if (error.message === 'access_denied') {
    // User denied authorization
  } else if (error.message === 'Session expired') {
    // Token refresh failed, user needs to re-login
    oauth.authorize();
  } else {
    console.error('OAuth error:', error);
  }
}
```

## React Example

```tsx
import { useState, useEffect } from 'react';
import { OAuthClient, MindCache, useMindCache } from 'mindcache';

const oauth = new OAuthClient({ clientId: 'mc_app_xxx' });

function App() {
  const [mc, setMc] = useState<MindCache | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      // Handle callback if present
      if (window.location.search.includes('code=')) {
        await oauth.handleCallback();
        window.history.replaceState({}, '', window.location.pathname);
      }

      if (oauth.isAuthenticated()) {
        const instance = new MindCache({
          cloud: {
            instanceId: oauth.getInstanceId()!,
            tokenProvider: oauth.tokenProvider
          }
        });
        setMc(instance);
      }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!mc) return <button onClick={() => oauth.authorize()}>Sign in with MindCache</button>;
  
  return <TodoApp mc={mc} />;
}

function TodoApp({ mc }: { mc: MindCache }) {
  const { value: todos, setValue } = useMindCache(mc, 'todos', []);
  
  return (
    <ul>
      {todos.map((todo, i) => (
        <li key={i}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

## Troubleshooting

### "Invalid redirect_uri"

Make sure the redirect URI in your app exactly matches one registered at Settings → OAuth Apps.

### "Popup blocked"

Use full-page redirect (default) instead of popup mode:
```typescript
oauth.authorize();  // Full redirect (recommended)
oauth.authorize({ popup: true });  // Popup (may be blocked)
```

### "Session expired"

The refresh token has expired (30 days). User needs to sign in again.

### CORS errors

Make sure you're calling the correct MindCache API endpoints. The default URLs point to production.
