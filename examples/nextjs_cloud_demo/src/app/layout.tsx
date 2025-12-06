import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { InstanceProvider } from '@/components/InstanceProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MindCache Cloud Demo',
  description: 'A Next.js example demonstrating MindCache Cloud sync with real-time collaboration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <InstanceProvider>{children}</InstanceProvider>
      </body>
    </html>
  )
}

