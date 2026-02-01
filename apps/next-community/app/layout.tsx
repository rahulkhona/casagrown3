import type { Metadata } from 'next'
import { NextTamaguiProvider } from '@casagrown/app/provider/NextTamaguiProvider'

export const metadata: Metadata = {
  title: 'CasaGrown - Fresh from Neighbors\' Backyard',
  description: 'Buy and sell fresh, locally-grown produce from your neighbors\' backyards.',
  icons: '/favicon.ico',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NextTamaguiProvider>{children}</NextTamaguiProvider>
      </body>
    </html>
  )
}
