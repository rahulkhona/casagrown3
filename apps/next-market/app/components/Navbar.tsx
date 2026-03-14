'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMarket, isMarketOpen } from '../../lib/store'
import { createClient } from '../../lib/supabase'
import styles from './Navbar.module.css'

export function Navbar() {
  const { state, dispatch } = useMarket()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const unreadCount = state.notifications.filter(n => !n.read).length
  const menuRef = useRef<HTMLDivElement>(null)

  const open = isMarketOpen(state.marketSchedule)

  // Check actual Supabase session
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user)
    })
  }, [pathname])

  // Primary nav tabs (always visible on desktop)
  const primaryNav = [
    { href: '/market', label: open ? 'Market Open' : 'Market Closed', icon: '🧺', hasStatus: true },
    { href: '/orders', label: 'Orders', icon: '📦' },
    { href: '/chat', label: 'Chat', icon: '💬' },
  ]

  // Extended menu items (in hamburger)
  const menuItems = [
    { href: '/my-booth', label: 'My Booth', icon: '🏪', section: 'main' },
    { href: '/my-booth/products', label: 'My Products', icon: '📦', section: 'main' },
    { href: '/my-booth/products/new', label: 'Add Product', icon: '➕', section: 'main' },
    { href: '/orders', label: 'Orders', icon: '🧾', section: 'main' },
    { href: '/chat', label: 'Chat', icon: '💬', section: 'main' },
    { href: '/earnings', label: 'Earnings', icon: '💰', section: 'main' },
    { href: '/following', label: 'Following', icon: '❤️', section: 'main' },
    { href: '/notifications', label: 'Notifications', icon: '🔔', section: 'account', badge: unreadCount },
    { href: '/profile', label: 'Profile', icon: '👤', section: 'account' },
    { href: '/my-booth/customize', label: 'Booth Settings', icon: '🎨', section: 'account' },
    { href: '/my-booth/invitations', label: 'Helpers', icon: '👥', section: 'account' },
    { href: '/my-booth/coupons', label: 'Coupons', icon: '🏷️', section: 'account' },
  ]

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close on navigation
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const mainItems = menuItems.filter(i => i.section === 'main')
  const accountItems = menuItems.filter(i => i.section === 'account')

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <img src="/logo.png" alt="CasaGrown" className={styles.logoImg} />
          <div className={styles.logoTextWrap}>
            <span className={styles.logoText}>CasaGrown</span>
            <span className={styles.logoTagline}>Fresh • Local • Trusted</span>
          </div>
        </Link>

        {/* Desktop Nav (primary tabs) */}
        <div className={`${styles.navLinks} hide-mobile`}>
          {primaryNav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname.startsWith(item.href) ? styles.navLinkActive : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.hasStatus && <span className={`${styles.statusDot} ${open ? styles.statusDotOpen : styles.statusDotClosed}`} />}
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Right Section */}
        <div className={styles.right}>
          {/* Notifications (quick access) */}
          <Link href="/notifications" className={styles.iconBtn}>
            🔔
            {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
          </Link>

          {/* Always-Visible Hamburger Menu */}
          <div className={styles.hamburgerWrapper} ref={menuRef}>
            <button className={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
              {menuOpen ? '✕' : '☰'}
            </button>

            {menuOpen && (
              <div className={styles.slideMenu}>
                {/* User info */}
                {state.isAuthenticated && (
                  <div className={styles.menuUser}>
                    <div className={styles.menuAvatar}>{state.user?.name?.charAt(0) || '?'}</div>
                    <div>
                      <strong className={styles.menuUserName}>{state.user?.name}</strong>
                      <span className={styles.menuUserEmail}>{state.user?.email}</span>
                    </div>
                  </div>
                )}

                {/* Main navigation */}
                <div className={styles.menuSection}>
                  <div className={styles.menuSectionLabel}>Navigation</div>
                  {mainItems.map(item => (
                    <Link key={item.href} href={item.href} className={`${styles.menuItem} ${pathname === item.href ? styles.menuItemActive : ''}`}>
                      <span className={styles.menuItemIcon}>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>

                {/* Account & Settings */}
                <div className={styles.menuSection}>
                  <div className={styles.menuSectionLabel}>Account</div>
                  {accountItems.map(item => (
                    <Link key={item.href} href={item.href} className={`${styles.menuItem} ${pathname === item.href ? styles.menuItemActive : ''}`}>
                      <span className={styles.menuItemIcon}>{item.icon}</span>
                      <span>{item.label}</span>
                      {item.badge ? <span className={styles.menuBadge}>{item.badge}</span> : null}
                    </Link>
                  ))}
                </div>

                {/* Auth */}
                <div className={styles.menuSection}>
                  {hasSession ? (
                    <button className={styles.menuItem} onClick={async () => {
                      const supabase = createClient()
                      await supabase.auth.signOut()
                      dispatch({ type: 'LOGOUT' })
                      setMenuOpen(false)
                      router.push('/')
                    }}>
                      <span className={styles.menuItemIcon}>🚪</span>
                      <span>Log Out</span>
                    </button>
                  ) : (
                    <Link href="/login" className={styles.menuItem}>
                      <span className={styles.menuItemIcon}>🔑</span>
                      <span>Sign In</span>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
