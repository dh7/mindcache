'use client';

import { MindCacheChat, useMindCacheContext } from 'mindcache';

/**
 * Simple local-first chat page
 * 
 * That's it! The MindCacheChat component handles:
 * - API key input (if not set)
 * - Real-time streaming
 * - MindCache tool integration
 * - Mobile-friendly UI
 */
export default function Home() {
  return (
    <main style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <MindCacheChat
        welcomeMessage="Hello! I'm running entirely in your browser. Your API key and data never leave your device."
        placeholder="Ask me anything..."
        style={{ flex: 1 }}
      />
    </main>
  );
}

function Header() {
  const { mindcache, isLoaded } = useMindCacheContext();
  
  return (
    <header style={{
      padding: '12px 16px',
      borderBottom: '1px solid #333',
      backgroundColor: '#000',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <h1 style={{ 
        margin: 0, 
        fontSize: '16px', 
        color: '#22c55e',
        fontFamily: 'system-ui'
      }}>
        Local-First Chat
      </h1>
      <span style={{ 
        fontSize: '12px', 
        color: '#666' 
      }}>
        {isLoaded ? `${Object.keys(mindcache?.getAll() || {}).length} keys in MindCache` : 'Loading...'}
      </span>
    </header>
  );
}
