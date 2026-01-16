'use client';

import { MindCacheProvider } from 'mindcache';
import { createOpenAI } from '@ai-sdk/openai';
import './globals.css';

// Create model with dynamic API key for AI SDK v5
const getModel = (apiKey: string) => {
  const openai = createOpenAI({ apiKey });
  return openai('gpt-4o');  // v2 interface: openai(model) not openai.chat(model)
};

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
            keyStorage: 'localStorage',
            storageKey: 'openai_api_key',
            // Model provider: receives API key, returns AI SDK v5 model
            modelProvider: getModel
          }}
        >
          {children}
        </MindCacheProvider>
      </body>
    </html>
  );
}
