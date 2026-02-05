'use client'

import React from 'react'
import { Provider } from '@casagrown/app/provider'

/**
 * Feed Layout - Minimal wrapper for FeedScreen
 * 
 * FeedScreen component handles its own header, footer, and navigation.
 * This layout only provides the Provider wrapper.
 */
export default function FeedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Provider>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
      }}>
        {children}
      </div>
    </Provider>
  )
}
