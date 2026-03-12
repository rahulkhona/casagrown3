import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'
import { AuthProvider } from '@casagrown/app/features/auth/auth-hook'

export const metadata: Metadata = {
  title: 'CasaGrown Admin',
  description: 'CasaGrown Admin Dashboard',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // You can use `suppressHydrationWarning` to avoid the warning about mismatched content during hydration in dev mode
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <AuthProvider><NextTamaguiProvider>{children}</NextTamaguiProvider></AuthProvider>
      </body>
    </html>
  )
}
