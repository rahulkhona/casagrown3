import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'

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
        <NextTamaguiProvider>{children}</NextTamaguiProvider>
      </body>
    </html>
  )
}
