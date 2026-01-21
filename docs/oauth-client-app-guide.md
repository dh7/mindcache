{% raw %}
# Building Apps with MindCache OAuth

Create apps where users can "Sign in with MindCache" to get automatic cloud storage and sync.

## Prerequisites

- Node.js 18+
- A MindCache account at [app.mindcache.dev](https://app.mindcache.dev)

## Step 1: Register Your OAuth App

1. Go to **Settings → OAuth Apps** in MindCache
2. Click **"+ New App"**
3. Fill in:
   - **Name**: Your app name (shown to users)
   - **Redirect URIs**: `http://localhost:3000` (add more for production)
   - **Scopes**: Select `read` and `write`
4. Click **Create App**
5. **Copy your Client ID and Client Secret** (secret shown only once!)

## Step 2: Create Your App

```bash
# Create a new Vite + React app
npm create vite@latest my-mindcache-app -- --template react-ts
cd my-mindcache-app

# Install MindCache
npm install mindcache
```

## Step 3: Add OAuth Login

Replace `src/App.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { OAuthClient, MindCache } from 'mindcache';

// Replace with your Client ID from Step 1
const CLIENT_ID = 'mc_app_your_client_id_here';

// baseUrl is REQUIRED - set it explicitly!
const oauth = new OAuthClient({
  clientId: CLIENT_ID,
  baseUrl: 'http://localhost:8787',  // Local dev (or 'https://api.mindcache.dev' for production)
  scopes: ['read', 'write']
});

function App() {
  const [mc, setMc] = useState<MindCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        // Handle OAuth callback
        if (window.location.search.includes('code=')) {
          await oauth.handleCallback();
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Check if authenticated
        if (oauth.isAuthenticated()) {
          const instanceId = oauth.getInstanceId();
          if (instanceId) {
            const instance = new MindCache({
              cloud: {
                instanceId,
                tokenProvider: oauth.tokenProvider,
                baseUrl: 'ws://localhost:8787' // Local dev server
              }
            });
            setMc(instance);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auth failed');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!mc) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <h1>My App</h1>
        <button 
          onClick={() => oauth.authorize()}
          style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer' }}
        >
          Sign in with MindCache
        </button>
      </div>
    );
  }

  return <MyApp mc={mc} />;
}

function MyApp({ mc }: { mc: MindCache }) {
  const [items, setItems] = useState<string[]>([]);
  const [input, setInput] = useState('');

  // Load data on mount
  useEffect(() => {
    const stored = mc.get_value('items');
    if (Array.isArray(stored)) {
      setItems(stored);
    }

    // Subscribe to changes (for real-time sync)
    const unsubscribe = mc.subscribe('items', (newItems) => {
      if (Array.isArray(newItems)) {
        setItems(newItems);
      }
    });

    return unsubscribe;
  }, [mc]);

  const addItem = () => {
    if (!input.trim()) return;
    const newItems = [...items, input.trim()];
    setItems(newItems);
    mc.set_value('items', newItems);
    setInput('');
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    mc.set_value('items', newItems);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px' }}>
      <h1>My Items</h1>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="Add item..."
          style={{ flex: 1, padding: '8px' }}
        />
        <button onClick={addItem}>Add</button>
      </div>

      <ul>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: '8px' }}>
            {item}
            <button 
              onClick={() => removeItem(i)} 
              style={{ marginLeft: '8px', color: 'red' }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button 
        onClick={() => oauth.logout().then(() => window.location.reload())}
        style={{ marginTop: '40px' }}
      >
        Sign out
      </button>
    </div>
  );
}

export default App;
```

## Step 4: Run Your App

```bash
npm run dev
```

Open http://localhost:3000 and click "Sign in with MindCache".

## How It Works

1. User clicks "Sign in with MindCache"
2. Redirected to MindCache consent page
3. User authorizes your app
4. Redirected back with auth code
5. Code exchanged for access token
6. MindCache auto-provisions an instance for this user
7. Your app connects and syncs data!

## Production Setup

For production, just change the baseUrl:

```tsx
const oauth = new OAuthClient({
  clientId: CLIENT_ID,
  baseUrl: 'https://api.mindcache.dev'  // Production API
});

const instance = new MindCache({
  cloud: {
    instanceId,
    tokenProvider: oauth.tokenProvider,
    baseUrl: 'https://api.mindcache.dev'
  }
});
```

Also add your production redirect URI in MindCache OAuth App settings.

## API Reference

### OAuthClient

```typescript
const oauth = new OAuthClient({
  clientId: string;       // Required
  redirectUri?: string;   // Default: current URL
  scopes?: string[];      // Default: ['read', 'write']
  authUrl?: string;       // Default: production
  tokenUrl?: string;      // Default: production
});

oauth.authorize()          // Start login flow
oauth.handleCallback()     // Handle redirect callback
oauth.isAuthenticated()    // Check if logged in
oauth.getInstanceId()      // Get user's instance ID
oauth.getAccessToken()     // Get access token (auto-refresh)
oauth.logout()             // Sign out
oauth.tokenProvider        // Token function for MindCache
```

### Scopes

| Scope | Description |
|-------|-------------|
| `read` | Read data |
| `write` | Read + write data |
| `profile` | Access user info (email, name) |

## Troubleshooting

**"Invalid redirect_uri"**: Make sure your app's URL matches what you registered in OAuth settings.

**"CORS error"**: Check that you're using the correct API URLs for your environment.

**"Session expired"**: The refresh token (30 days) expired. User needs to sign in again.
{% endraw %}
