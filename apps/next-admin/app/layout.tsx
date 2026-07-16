import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'
import { AuthProvider } from '@casagrown/app/features/auth/auth-hook'
import { AuthGuard } from './auth-guard'

// Trigger vercel automated build from github
export const metadata: Metadata = {
  title: 'CasaGrown Admin',
  description: 'CasaGrown Admin Dashboard',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.warn('[Admin SW] Registration failed:', err);
              });
            });
          }
        ` }} />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <NextTamaguiProvider>
            <AuthGuard>{children}</AuthGuard>
          </NextTamaguiProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
