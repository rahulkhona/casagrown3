'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMarket, isMarketOpen } from '../../lib/store'
import styles from './BottomNav.module.css'

const tabs = [
  { href: '/market', label: 'Market', icon: '🧺', hasStatus: true },
  { href: '/orders', label: 'Orders', icon: '📦' },
]

export function BottomNav() {
  const pathname = usePathname()
  const { state } = useMarket()
  const open = isMarketOpen(state.marketSchedule)

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <nav className={styles.bottomNav}>
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
