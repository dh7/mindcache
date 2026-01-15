import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GitHub Notes - GitStore Demo',
  description: 'Save and sync notes to GitHub using GitStore OAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
