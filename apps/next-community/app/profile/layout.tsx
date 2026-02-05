'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Provider } from '@casagrown/app/provider'
import { colors } from '@casagrown/app/design-tokens'

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <Provider>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        backgroundColor: colors.gray[50]
      }}>
        {/* Main Content */}
        <main style={{ flex: 1, paddingBottom: '70px' }}>
          {children}
        </main>

        {/* Bottom Navigation */}
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70px',
          backgroundColor: colors.white,
          borderTop: `1px solid ${colors.gray[200]}`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '40px',
          zIndex: 1000,
        }}>
          <Link 
            href="/feed" 
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: pathname === '/feed' ? colors.green[600] : colors.gray[400],
              fontWeight: pathname === '/feed' ? '600' : '400',
              fontSize: '12px',
            }}
          >
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span>Feed</span>
          </Link>

          <Link 
            href="/profile" 
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: pathname?.startsWith('/profile') ? colors.green[600] : colors.gray[400],
              fontWeight: pathname?.startsWith('/profile') ? '600' : '400',
              fontSize: '12px',
            }}
          >
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="5" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
            <span>Profile</span>
          </Link>
        </nav>
      </div>
    </Provider>
  )
}
