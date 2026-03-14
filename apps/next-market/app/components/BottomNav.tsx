'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './BottomNav.module.css'

const tabs = [
  { href: '/', label: 'Home', icon: '🏠', exact: true },
  { href: '/market', label: 'Browse', icon: '🏪' },
  { href: '/my-booth', label: 'My Booth', icon: '🌱' },
  { href: '/orders', label: 'Orders', icon: '📦' },
  { href: '/chat', label: 'Chat', icon: '💬' },
]

export function BottomNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav className={styles.bottomNav}>
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`${styles.tab} ${isActive(tab.href, tab.exact) ? styles.tabActive : ''}`}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}
