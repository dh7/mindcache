'use client';

import { MindCacheProvider } from 'mindcache';
import './globals.css';

/**
 * Local-first MindCache app layout
 *
 * - API key stored in browser localStorage (never sent to server)
 * - AI runs directly in browser → OpenAI
 * - Data persisted in IndexedDB
 * - No server required!
 */
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
              dbName: 'local_first_chat',
              storeName: 'mindcache'
            }
          }}
          ai={{
            provider: 'openai',
            model: 'gpt-4o',
            keyStorage: 'localStorage'
          }}
        >
          {children}
        </MindCacheProvider>
      </body>
    </html>
  );
}
