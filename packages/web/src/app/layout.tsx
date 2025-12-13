import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'MindCache - AI Agent Memory Made Simple',
  description: 'MindCache is a TypeScript library for managing short-term memory in AI agents through a simple, LLM-friendly key-value repository. Now with cloud persistence, real-time sync, and collaboration.',
  keywords: ['AI agents', 'memory management', 'TypeScript', 'LLM', 'key-value store', 'AI tools', 'collaboration'],
  authors: [{ name: 'MindCache' }],
  creator: 'MindCache',
  publisher: 'MindCache',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://app.mindcache.dev'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'MindCache',
    title: 'MindCache - AI Agent Memory Made Simple',
    description: 'MindCache is a TypeScript library for managing short-term memory in AI agents through a simple, LLM-friendly key-value repository. Now with cloud persistence, real-time sync, and collaboration.',
    images: [
      {
        url: '/mindcache.png',
        width: 2342,
        height: 690,
        alt: 'MindCache - AI Agent Memory Made Simple'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MindCache - AI Agent Memory Made Simple',
    description: 'MindCache is a TypeScript library for managing short-term memory in AI agents through a simple, LLM-friendly key-value repository.',
    images: ['/mindcache.png'],
    creator: '@mindcache'
  },
  icons: {
    icon: '/mindcache.png',
    apple: '/mindcache.png',
    shortcut: '/mindcache.png'
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true
  }
};

// Disable static generation - this app requires auth
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Header />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

