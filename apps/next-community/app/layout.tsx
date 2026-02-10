import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'
import { AuthGuard } from './auth-guard'

if (typeof globalThis.__DEV__ === 'undefined') {
  // @ts-ignore
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production'
}

export const metadata: Metadata = {
  title: 'CasaGrown - Fresh from Neighbors\' Backyard',
  description: 'Buy and sell fresh, locally-grown produce from your neighbors\' backyards.',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Polyfill __DEV__ before ANY client JS modules evaluate.
            Turbopack ignores webpack DefinePlugin, and module-level
            globalThis assignments in provider/index.tsx run too late. */}
        <script dangerouslySetInnerHTML={{ __html: `
          if (typeof globalThis !== 'undefined' && typeof globalThis.__DEV__ === 'undefined') {
            globalThis.__DEV__ = true;
          }
          if (typeof window !== 'undefined' && typeof window.__DEV__ === 'undefined') {
            window.__DEV__ = true;
          }
        ` }} />
      </head>
      <body suppressHydrationWarning>
        <NextTamaguiProvider>
          <AuthGuard>{children}</AuthGuard>
        </NextTamaguiProvider>
      </body>
    </html>
  )
}

