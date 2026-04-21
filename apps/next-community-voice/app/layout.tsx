import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'
import { AuthProvider } from '@casagrown/app/features/auth/auth-hook'
import { AuthGuard } from './auth-guard'
import ClientOnly from './ClientOnly'

// @ts-ignore – __DEV__ polyfill
if (typeof globalThis.__DEV__ === 'undefined') {
  // @ts-ignore
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production'
}

export const metadata: Metadata = {
  title: 'CasaGrown Community Voice',
  description: 'Share your ideas and report bugs to help improve CasaGrown.',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* Polyfill __DEV__ before ANY client JS modules evaluate. */}
        <script dangerouslySetInnerHTML={{ __html: `
          if (typeof globalThis !== 'undefined' && typeof globalThis.__DEV__ === 'undefined') {
            globalThis.__DEV__ = true;
          }
          if (typeof window !== 'undefined' && typeof window.__DEV__ === 'undefined') {
            window.__DEV__ = true;
          }
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.warn('[Voice SW] Registration failed:', err);
              });
            });
          }
        ` }} />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <NextTamaguiProvider disableNotifications>
            <ClientOnly>
              <AuthGuard>{children}</AuthGuard>
            </ClientOnly>
          </NextTamaguiProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
