'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Provider } from '@casagrown/app/provider'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { colors } from '@casagrown/app/design-tokens'

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <Provider>
      <ProfilePresenceWrapper pathname={pathname}>{children}</ProfilePresenceWrapper>
    </Provider>
  )
}

function ProfilePresenceWrapper({ children, pathname }: { children: React.ReactNode; pathname: string | null }) {
  const { user } = useAuth()
  return (
    <>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        backgroundColor: colors.gray[50]
      }}>
        {/* Main Content */}
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </div>
    </>
  )
}
