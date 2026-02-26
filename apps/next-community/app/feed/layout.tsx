'use client'

import React from 'react'
import { Provider } from '@casagrown/app/provider'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

/**
 * Feed Layout - Minimal wrapper for FeedScreen
 * 
 * FeedScreen component handles its own header, footer, and navigation.
 * This layout provides Provider wrapper.
 */
export default function FeedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Provider>
      <FeedPresenceWrapper>{children}</FeedPresenceWrapper>
    </Provider>
  )
}

function FeedPresenceWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
      }}>
        {children}
      </div>
    </>
  )
}
