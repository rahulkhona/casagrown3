import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CasaGrown Metrics',
  description: 'Analytics dashboards and business intelligence for CasaGrown staff.',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          if (typeof globalThis !== 'undefined' && typeof globalThis.__DEV__ === 'undefined') {
            globalThis.__DEV__ = true;
          }
          if (typeof window !== 'undefined' && typeof window.__DEV__ === 'undefined') {
            window.__DEV__ = true;
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
