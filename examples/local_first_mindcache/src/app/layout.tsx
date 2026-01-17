'use client';

import { MindCacheProvider } from 'mindcache';
import './globals.css';

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MindCacheProvider
          mindcache={{
            indexedDB: {
              dbName: 'local_first_mindcache',
              storeName: 'mindcache_store',
              debounceMs: 500
            }
          }}
          ai={{
            provider: 'openai',
            model: 'gpt-4o',
            keyStorage: 'localStorage',
            storageKey: 'openai_api_key'
          }}
        >
          {children}
        </MindCacheProvider>
      </body>
    </html>
  );
}
