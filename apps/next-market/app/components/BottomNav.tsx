'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMarket, isMarketOpen } from '../../lib/store'
import { useAuth } from '../../lib/useAuth'
import { createClient } from '../../lib/supabase'
import styles from './BottomNav.module.css'

function useUnreadMessageCount(userId?: string) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) {
       setCount(0)
       return 
    }

    const supabase = createClient()
    const fetchCount = async () => {
      const { data } = await supabase
        .from('market_conversations')
        .select('unread_count_a, unread_count_b, participant_a, participant_b')
        .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      
      if (!data) return
      let total = 0
      for (const row of data) {
        if (row.participant_a === userId) total += row.unread_count_a
        if (row.participant_b === userId) total += row.unread_count_b
      }
      setCount(total)
    }

    fetchCount()
    
    // Polling interval matching the 15s decay pulse pattern
    const interval = setInterval(fetchCount, 15000)
    
    const forceUpdate = () => {
      setCount(prev => Math.max(0, prev - 1))
      fetchCount()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('force-badge-update', forceUpdate)
    }
    
    return () => {
      clearInterval(interval)
      if (typeof window !== 'undefined') window.removeEventListener('force-badge-update', forceUpdate)
    }
  }, [userId])

  return count
}

/** Detect mobile keyboard via visualViewport shrinkage */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const THRESHOLD = 150 // keyboard is typically 250-350px

    const onResize = () => {
      // Compare visualViewport height against window.innerHeight
      // When keyboard is open, visualViewport shrinks but innerHeight stays the same
      // When browser is resized, both change together
      const heightDiff = window.innerHeight - vv.height
      setVisible(heightDiff > THRESHOLD)
    }

    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  return visible
}

const tabs = [
  { href: '/market', label: 'Market', icon: '🧺', hasStatus: true, locked: false, tour: 'nav-market' },
  { href: '/orders', label: 'Orders', icon: '📦', locked: true, tour: 'nav-orders' },
  { href: '/messages', label: 'Messages', icon: '💬', locked: true, tour: 'nav-messages' },
  { href: '/community', label: 'Buzz', icon: '🐝', locked: true, tour: 'nav-buzz' },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { state } = useMarket()
  const { user, profileComplete, isAuthenticated } = useAuth()
  const open = isMarketOpen(state.marketSchedule, state.marketNeverCloses)
  const keyboardOpen = useKeyboardVisible()
  const unreadCount = useUnreadMessageCount(user?.id)

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
            <span className={styles.icon}>
              {tab.icon}
              {tab.href === '/messages' && unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#ef4444', color: 'white', fontSize: '0.65rem',
                  fontWeight: 'bold', width: 16, height: 16, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                  border: '1px solid white'
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
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
