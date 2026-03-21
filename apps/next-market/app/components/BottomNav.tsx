'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMarket, isMarketOpen } from '../../lib/store'
import { useAuth } from '../../lib/useAuth'
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
  { href: '/market', label: 'Market', icon: '🧺', hasStatus: true, locked: false, tour: 'nav-market' },
  { href: '/orders', label: 'Orders', icon: '📦', locked: true, tour: 'nav-orders' },
  { href: '/community', label: 'Buzz', icon: '🐝', locked: true, tour: 'nav-buzz' },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { state } = useMarket()
  const { profileComplete, isAuthenticated } = useAuth()
  const open = isMarketOpen(state.marketSchedule, state.marketNeverCloses)
  const keyboardOpen = useKeyboardVisible()

  const isActive = (href: string) => pathname.startsWith(href)
  const isProfileLocked = profileComplete !== true
  const lockRedirect = isAuthenticated ? '/profile-setup' : '/login'

  return (
    <nav className={`${styles.bottomNav} ${keyboardOpen ? styles.bottomNavHidden : ''}`}>
      {tabs.map(tab => {
        const tabLocked = tab.locked && isProfileLocked
        return tabLocked ? (
          <button
            key={tab.href}
            className={`${styles.tab} ${styles.tabLocked}`}
            onClick={() => router.push(lockRedirect)}
            title="Complete your profile to unlock"
            data-tour={tab.tour}
          >
            <span className={styles.icon}>{tab.icon}</span>
            <span className={styles.label}>
              {tab.label} 🔒
            </span>
          </button>
        ) : (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${isActive(tab.href) ? styles.tabActive : ''}`}
            data-tour={tab.tour}
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
        )
      })}
    </nav>
  )
}
