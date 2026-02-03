import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'

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
      <body suppressHydrationWarning>
        <NextTamaguiProvider>{children}</NextTamaguiProvider>
      </body>
    </html>
  )
}
