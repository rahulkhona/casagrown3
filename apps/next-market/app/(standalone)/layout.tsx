/**
 * Standalone Layout — pages without the main Navbar & BottomNav
 * Used for: /testers, landing pages, public forms, /pro checkout
 */
'use client'

import { BootstrapProvider } from '../../lib/useBootstrap'

export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <BootstrapProvider>
      {children}
    </BootstrapProvider>
  )
}
