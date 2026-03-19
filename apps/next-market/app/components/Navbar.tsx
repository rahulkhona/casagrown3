'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMarket, isMarketOpen } from '../../lib/store'
import { createClient } from '../../lib/supabase'
import html2canvas from 'html2canvas'
import styles from './Navbar.module.css'

interface Notification {
  id: string
  content: string
  link_url: string | null
  read_at: string | null
  created_at: string
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function Navbar() {
  const { state, dispatch } = useMarket()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  // Notification panel state
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Inline rating modal state
  const [ratingNotif, setRatingNotif] = useState<Notification | null>(null)
  const [ratingHover, setRatingHover] = useState(0)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)

  // Bug report state
  const [bugOpen, setBugOpen] = useState(false)
  const [bugType, setBugType] = useState<'bug' | 'feature' | 'support'>('bug')
  const [bugMessage, setBugMessage] = useState('')
  const [bugSending, setBugSending] = useState(false)
  const [bugSent, setBugSent] = useState(false)
  const [bugScreenshot, setBugScreenshot] = useState<string | null>(null)
  const bugRef = useRef<HTMLDivElement>(null)

  const open = isMarketOpen(state.marketSchedule, state.marketNeverCloses)

  // Check actual Supabase session + fetch profile name
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      setHasSession(!!user)
      if (user) {
        setProfileEmail(user.email || '')
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single()
        if (profile?.full_name) setProfileName(profile.full_name)
        if (profile?.avatar_url) setProfileAvatar(profile.avatar_url)
      }
    })
  }, [pathname])

  // Poll unread notification count every 60s
  useEffect(() => {
    if (!hasSession) return
    const supabase = createClient()
    const fetchCount = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      setUserId(user.id)
      const { count } = await supabase
        .from('market_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)
      setUnreadCount(count || 0)
    }
    fetchCount()
    const id = setInterval(fetchCount, 60_000) // slow: 60s
    return () => clearInterval(id)
  }, [hasSession, pathname])

  // Fetch notifications when panel opens
  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    setNotifLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('market_notifications')
      .select('id, content, link_url, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setNotifications(data)
    setNotifLoading(false)
  }, [userId])

  useEffect(() => {
    if (notifOpen) fetchNotifications()
  }, [notifOpen, fetchNotifications])

  // Dismiss a single notification: delete from DB, remove from list, navigate
  const dismissNotification = useCallback(async (notif: Notification) => {
    // If it's a rating notification, show inline rating modal instead
    if (notif.content.toLowerCase().includes('rate')) {
      setRatingNotif(notif)
      setRatingHover(0)
      setRatingSubmitted(false)
      return
    }
    setNotifications(prev => prev.filter(n => n.id !== notif.id))
    setUnreadCount(prev => Math.max(0, prev - (notif.read_at ? 0 : 1)))
    setNotifOpen(false)
    const supabase = createClient()
    await supabase.from('market_notifications').delete().eq('id', notif.id)
    if (notif.link_url) router.push(notif.link_url)
  }, [router])

  // Submit inline rating
  const submitRating = useCallback(async (stars: number) => {
    if (!ratingNotif) return
    setRatingSubmitted(true)
    const supabase = createClient()
    // Extract order ID from link_url (e.g. /orders/uuid or /earnings)
    const orderMatch = ratingNotif.link_url?.match(/\/orders\/([a-f0-9-]+)/)
    if (orderMatch) {
      await supabase.rpc('rate_market_order', { p_order_id: orderMatch[1], p_rating: stars })
    }
    // Remove the notification
    await supabase.from('market_notifications').delete().eq('id', ratingNotif.id)
    setNotifications(prev => prev.filter(n => n.id !== ratingNotif.id))
    setUnreadCount(prev => Math.max(0, prev - 1))
    setTimeout(() => { setRatingNotif(null); setRatingSubmitted(false) }, 1500)
  }, [ratingNotif])

  // Clear all notifications
  const clearAllNotifications = useCallback(async () => {
    if (!userId) return
    setNotifications([])
    setUnreadCount(0)
    const supabase = createClient()
    await supabase.from('market_notifications').delete().eq('user_id', userId)
  }, [userId])

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifOpen])

  // Close panels on navigation
  useEffect(() => { setNotifOpen(false) }, [pathname])

  // Primary nav tabs (always visible on desktop)
  const primaryNav = [
    { href: '/market', label: open ? 'Market Open' : 'Market Closed', icon: '🧺', hasStatus: true },
    { href: '/orders', label: 'Orders', icon: '📦' },
    { href: '/community', label: 'Buzz', icon: '🐝' },
  ]

  // Extended menu items (hamburger only — items NOT in BottomNav/header)
  const menuItems = [
    { href: '/my-booth', label: 'My Booth', icon: '🏪', section: 'main' },
    { href: '/helping', label: 'Helping', icon: '🤝', section: 'main' },
    { href: '/earnings', label: 'Transactions', icon: '💰', section: 'main' },
    { href: '/earnings/payout', label: 'Payout', icon: '💸', section: 'main' },
    { href: '/following', label: 'Following', icon: '❤️', section: 'main' },
    { href: '/profile', label: 'Profile', icon: '👤', section: 'account' },
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

  // Close menu on navigation
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const mainItems = menuItems.filter(i => i.section === 'main')
  const accountItems = menuItems.filter(i => i.section === 'account')

  return (
    <>
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
          {/* Profile indicator (always visible for quick account identification) */}
          {hasSession && profileName && (
            <Link href="/profile" className={styles.profileBadge} title={profileEmail}>
              {profileAvatar ? (
                <img src={profileAvatar} alt="" className={styles.profileInitial} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span className={styles.profileInitial}>{profileName.charAt(0).toUpperCase()}</span>
              )}
              <span className={`${styles.profileName} hide-mobile`}>{profileName.split(' ')[0]}</span>
            </Link>
          )}
          {/* Bug Report Button */}
          {hasSession && (
            <button
              className={styles.iconBtn}
              onClick={async () => {
                // Capture screenshot before opening modal
                try {
                  const canvas = await html2canvas(document.documentElement, { useCORS: true, scale: 0.5, logging: false, windowHeight: document.documentElement.scrollHeight, height: document.documentElement.scrollHeight })
                  setBugScreenshot(canvas.toDataURL('image/jpeg', 0.6))
                } catch { setBugScreenshot(null) }
                setBugOpen(true)
                if (notifOpen) setNotifOpen(false)
                if (menuOpen) setMenuOpen(false)
              }}
              aria-label="Report Bug"
              title="Report a bug or send feedback"
            >
              ❓
            </button>
          )}

          {/* Notifications dropdown */}
          <div className={styles.notifWrapper} ref={notifRef}>
            <button
              className={styles.iconBtn}
              onClick={() => {
                if (!hasSession) { router.push('/login?redirect=/notifications'); return }
                setNotifOpen(!notifOpen); if (menuOpen) setMenuOpen(false)
              }}
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className={styles.notifPanel}>
                <div className={styles.notifHeader}>
                  <span className={styles.notifTitle}>Notifications</span>
                  {notifications.length > 0 && (
                    <button className={styles.notifClearBtn} onClick={clearAllNotifications}>Clear All</button>
                  )}
                </div>

                {notifLoading ? (
                  <div className={styles.notifEmpty}>Loading...</div>
                ) : notifications.length === 0 ? (
                  <div className={styles.notifEmpty}>
                    <span style={{ fontSize: 32 }}>🔔</span>
                    <p>No notifications</p>
                  </div>
                ) : (
                  <div className={styles.notifList}>
                    {notifications.map(n => (
                      <button
                        key={n.id}
                        className={`${styles.notifItem} ${!n.read_at ? styles.notifItemUnread : ''}`}
                        onClick={() => dismissNotification(n)}
                      >
                        <span className={styles.notifContent}>{n.content}</span>
                        <span className={styles.notifTime}>{formatTimeAgo(n.created_at)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <Link href="/notifications" className={styles.notifFooter} onClick={() => setNotifOpen(false)}>
                  View All →
                </Link>
              </div>
            )}

            {/* Inline Rating Modal */}
            {ratingNotif && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.4)', zIndex: 10001,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} onClick={() => setRatingNotif(null)}>
                <div style={{
                  background: 'white', borderRadius: 16, padding: '24px 28px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxWidth: 360, width: '90%',
                  animation: 'slideUp 0.3s ease-out',
                }} onClick={e => e.stopPropagation()}>
                  <style>{`@keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
                  {ratingSubmitted ? (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                      <p style={{ color: '#166534', fontWeight: 600, fontSize: 16, margin: 0 }}>Thanks for rating!</p>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', margin: '0 0 4px', textAlign: 'center' }}>
                        ⭐ Rate your experience
                      </p>
                      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px', textAlign: 'center' }}>
                        {ratingNotif.content.replace(/^[^a-zA-Z]*/, '').replace(/\. Rate.*$/i, '')}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '8px 0' }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            onClick={() => submitRating(star)}
                            onMouseEnter={() => setRatingHover(star)}
                            onMouseLeave={() => setRatingHover(0)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 36, padding: '4px 2px',
                              transform: ratingHover >= star ? 'scale(1.2)' : 'scale(1)',
                              opacity: ratingHover >= star ? 1 : 0.3,
                              transition: 'all 0.15s ease',
                              filter: ratingHover >= star ? 'none' : 'grayscale(0.5)',
                            }}
                          >
                            ⭐
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setRatingNotif(null)}
                        style={{
                          display: 'block', width: '100%', background: 'none', border: 'none',
                          color: '#9ca3af', fontSize: 13, padding: '8px 0 0', cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        Skip for now
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Always-Visible Hamburger Menu */}
          <div className={styles.hamburgerWrapper} ref={menuRef}>
            <button className={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
              {menuOpen ? '✕' : '☰'}
            </button>

            {menuOpen && (
              <div className={styles.slideMenu}>
                {/* Auth - Sign In at top when logged out */}
                {!hasSession && (
                  <div className={styles.menuSection}>
                    <Link href="/login" className={styles.menuItem} style={{ fontWeight: 600, color: 'var(--green-700)' }}>
                      <span className={styles.menuItemIcon}>🔑</span>
                      <span>Sign In</span>
                    </Link>
                  </div>
                )}

                {/* User info - only when logged in */}
                {state.isAuthenticated && (
                  <div className={styles.menuUser}>
                    {profileAvatar ? (
                      <img src={profileAvatar} alt="" className={styles.menuAvatar} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div className={styles.menuAvatar}>{state.user?.name?.charAt(0) || '?'}</div>
                    )}
                    <div>
                      <strong className={styles.menuUserName}>{state.user?.name}</strong>
                      <span className={styles.menuUserEmail}>{state.user?.email}</span>
                    </div>
                  </div>
                )}

                {/* Main navigation - only when logged in */}
                {hasSession && (
                  <div className={styles.menuSection}>
                    <div className={styles.menuSectionLabel}>Navigation</div>
                    {mainItems.map(item => (
                      <Link key={item.href} href={item.href} className={`${styles.menuItem} ${pathname === item.href ? styles.menuItemActive : ''}`}>
                        <span className={styles.menuItemIcon}>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Account - only when logged in */}
                {hasSession && (
                  <div className={styles.menuSection}>
                    <div className={styles.menuSectionLabel}>Account</div>
                    {accountItems.map(item => (
                      <Link key={item.href} href={item.href} className={`${styles.menuItem} ${pathname === item.href ? styles.menuItemActive : ''}`}>
                        <span className={styles.menuItemIcon}>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Support & Legal - always visible */}
                <div className={styles.menuSection}>
                  <div className={styles.menuSectionLabel}>Support & Legal</div>
                  <Link href="/voice/board" className={`${styles.menuItem} ${pathname.startsWith('/voice') ? styles.menuItemActive : ''}`}>
                    <span className={styles.menuItemIcon}>📋</span>
                    <span>Contact Support</span>
                  </Link>
                  <Link href="/terms" className={`${styles.menuItem} ${pathname === '/terms' ? styles.menuItemActive : ''}`}>
                    <span className={styles.menuItemIcon}>📄</span>
                    <span>Terms of Use</span>
                  </Link>
                  <Link href="/terms?tab=privacy" className={styles.menuItem}>
                    <span className={styles.menuItemIcon}>🔒</span>
                    <span>Privacy Policy</span>
                  </Link>
                </div>

                {/* Log Out - only when logged in */}
                {hasSession && (
                  <div className={styles.menuSection}>
                    <button className={styles.menuItem} onClick={async () => {
                      const supabase = createClient()
                      await supabase.auth.signOut({ scope: 'local' })
                      dispatch({ type: 'LOGOUT' })
                      setMenuOpen(false)
                      window.location.href = '/'
                    }}>
                      <span className={styles.menuItemIcon}>🚪</span>
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>

    {/* ── Bug Report Modal ── */}
    {bugOpen && (
      <>
        <div onClick={() => { setBugOpen(false); setBugSent(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9991 }} />
        <div ref={bugRef} style={{
          position: 'fixed', top: 60, right: 16, zIndex: 9992,
          width: 'min(92vw, 380px)',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px 10px', background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>❓ Send Feedback</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Help us improve CasaGrown</div>
            </div>
            <button onClick={() => { setBugOpen(false); setBugSent(false) }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.8 }}>✕</button>
          </div>

          {bugSent ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#166534' }}>Thank you!</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Your report has been submitted with a screenshot.</p>
            </div>
          ) : (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Type selector chips */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { id: 'bug' as const, icon: '🐛', label: 'Bug', color: '#dc2626' },
                  { id: 'feature' as const, icon: '💡', label: 'Feature', color: '#7c3aed' },
                  { id: 'support' as const, icon: '🎧', label: 'Support', color: '#0891b2' },
                ]).map(t => (
                  <button key={t.id} onClick={() => setBugType(t.id)} style={{
                    flex: 1, padding: '8px 6px', borderRadius: 10,
                    border: `1.5px solid ${bugType === t.id ? t.color : '#e5e7eb'}`,
                    background: bugType === t.id ? `${t.color}10` : '#fff',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 2, transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: 18 }}>{t.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: bugType === t.id ? t.color : '#6b7280' }}>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Screenshot preview */}
              {bugScreenshot && (
                <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', position: 'relative' }}>
                  <img src={bugScreenshot} alt="Screenshot" style={{ width: '100%', height: 120, objectFit: 'cover', objectPosition: 'top' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: '#f9fafb' }}>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>📸 Screenshot auto-captured</span>
                    <button onClick={() => setBugScreenshot(null)} style={{ background: 'none', border: 'none', fontSize: 10, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>✕ Remove</button>
                  </div>
                </div>
              )}

              {/* Message input */}
              <textarea
                placeholder={bugType === 'bug' ? "What went wrong? Describe what happened..." : bugType === 'feature' ? "What feature would you like to see?" : "How can we help you?"}
                value={bugMessage}
                onChange={e => setBugMessage(e.target.value)}
                rows={3}
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                  borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none', lineHeight: 1.45,
                  boxSizing: 'border-box',
                }}
              />

              {/* Context hint */}
              <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                📍 Page URL + screenshot attached automatically
              </div>

              {/* Submit */}
              <button
                onClick={async () => {
                  if (!userId || !bugMessage.trim()) return
                  setBugSending(true)
                  try {
                    const supabase = createClient()
                    // Upload screenshot if available
                    let screenshotUrl: string | null = null
                    if (bugScreenshot) {
                      const blob = await (await fetch(bugScreenshot)).blob()
                      const path = `feedback/${userId}/${Date.now()}.jpg`
                      const { data: upload } = await supabase.storage.from('feedback-screenshots').upload(path, blob, { contentType: 'image/jpeg' })
                      if (upload) {
                        const { data: urlData } = supabase.storage.from('feedback-screenshots').getPublicUrl(path)
                        screenshotUrl = urlData?.publicUrl || null
                      }
                    }
                    await supabase.from('user_feedback').insert({
                      reporter_id: userId,
                      type: bugType,
                      message: bugMessage,
                      page_url: window.location.href,
                      user_agent: navigator.userAgent,
                      extra_context: {
                        viewport: `${window.innerWidth}x${window.innerHeight}`,
                        timestamp: new Date().toISOString(),
                        platform: navigator.platform,
                        screenshot_url: screenshotUrl,
                      },
                    })
                    setBugSent(true)
                    setBugMessage('')
                    setTimeout(() => { setBugOpen(false); setBugSent(false) }, 2000)
                  } catch (err: any) {
                    alert('Failed: ' + (err.message || 'Unknown error'))
                  } finally {
                    setBugSending(false)
                  }
                }}
                disabled={!bugMessage.trim() || bugSending}
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: 10,
                  background: bugSending || !bugMessage.trim() ? '#e5e7eb' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  border: 'none', color: bugSending || !bugMessage.trim() ? '#9ca3af' : '#fff',
                  cursor: bugSending || !bugMessage.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
                }}
              >
                {bugSending ? '⏳ Sending...' : 'Submit Report'}
              </button>
            </div>
          )}
        </div>
      </>
    )}
    </>
  )
}
