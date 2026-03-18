'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMarket, isMarketOpen } from '../../lib/store'
import styles from './BottomNav.module.css'

/** Detect mobile keyboard via visualViewport shrinkage */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const initialHeight = vv.height
    const THRESHOLD = 150 // keyboard is typically 250-350px

    const onResize = () => {
      setVisible(initialHeight - vv.height > THRESHOLD)
    }

    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  return visible
}

const tabs = [
  { href: '/market', label: 'Market', icon: '🧺', hasStatus: true },
  { href: '/orders', label: 'Orders', icon: '📦' },
  { href: '/community', label: 'Buzz', icon: '🐝' },
]

export function BottomNav() {
  const pathname = usePathname()
  const { state } = useMarket()
  const open = isMarketOpen(state.marketSchedule, state.marketNeverCloses)
  const keyboardOpen = useKeyboardVisible()

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <nav className={`${styles.bottomNav} ${keyboardOpen ? styles.bottomNavHidden : ''}`}>
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`${styles.tab} ${isActive(tab.href) ? styles.tabActive : ''}`}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>
            {tab.hasStatus && (
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: open ? '#22c55e' : '#ef4444',
                marginRight: 4, verticalAlign: 'middle',
              }} />
            )}
            {tab.label}
          </span>
        </Link>
      ))}
    </nav>
  )
}

