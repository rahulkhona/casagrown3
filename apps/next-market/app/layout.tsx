import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CasaGrown Market — Fresh from Neighbors\' Backyard',
  description: 'Buy and sell fresh, locally-grown produce from your neighbors. Market opens Saturdays & Sundays 8–11 AM.',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CasaGrown Market" />
        <meta name="theme-color" content="#16a34a" />
        {/* Service Worker registration for Web Push */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.log('[SW] Registration failed:', err);
              });
            });
          }
        ` }} />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
