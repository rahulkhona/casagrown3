'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMarket, isMarketOpen, getNextMarketDate } from '../../../lib/store'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

// ── Countdown Timer Hook ──
function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const targetMs = targetDate?.getTime() ?? 0

  useEffect(() => {
    if (!targetMs) return
    const tick = () => {
      const diff = targetMs - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetMs])

  return timeLeft
}

export default function MarketPage() {
  const { state, dispatch } = useMarket()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const open = isMarketOpen(state.marketSchedule)
  const nextMarket = getNextMarketDate(state.marketSchedule)
  const countdown = useCountdown(nextMarket?.date ?? null)
  const [search, setSearch] = useState('')

  // Reminder state
  const [showReminder, setShowReminder] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [reminderSet, setReminderSet] = useState(false)
  const [reminderTime, setReminderTime] = useState('30') // minutes before

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission)
    } else {
      setNotifPermission('unsupported')
    }
  }, [])

  // Check if user already has a reminder set for next market
  useEffect(() => {
    if (!user || !nextMarket) return
    supabase
      .from('market_reminders')
      .select('id, reminder_minutes')
      .eq('user_id', user.id)
      .eq('market_date', nextMarket.date.toISOString())
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setReminderSet(true)
          setReminderTime(String(data.reminder_minutes))
        }
      })
  }, [user, nextMarket?.date?.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
    if (perm === 'granted') {
      new Notification('🌱 CasaGrown Market', {
        body: 'You\'ll be reminded before the next market opens!',
        icon: '/logo.png',
      })
    }
  }

  const handleSetReminder = async () => {
    if (notifPermission !== 'granted') {
      requestNotifPermission()
      return
    }
    if (!user) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Sign in to set a reminder', type: 'info' } })
      router.push('/login?returnTo=/market')
      return
    }
    if (!nextMarket) return

    const minutes = parseInt(reminderTime)
    const remindAt = new Date(nextMarket.date.getTime() - minutes * 60 * 1000)

    // Upsert to database
    const { error } = await supabase
      .from('market_reminders')
      .upsert({
        user_id: user.id,
        market_date: nextMarket.date.toISOString(),
        remind_at: remindAt.toISOString(),
        reminder_minutes: minutes,
      }, { onConflict: 'user_id,market_date' })

    if (error) {
      console.error('Failed to save reminder:', error.message)
      return
    }

    setReminderSet(true)

    // Also schedule client-side notification as bonus (works while tab is open)
    const notifTime = remindAt.getTime() - Date.now()
    if (notifTime > 0) {
      setTimeout(() => {
        new Notification('🌱 Market opens soon!', {
          body: `CasaGrown Market opens in ${reminderTime} minutes. Get your list ready!`,
          icon: '/logo.png',
        })
      }, notifTime)
    }
  }

  // ── Market Closed State ──
  if (!open) {
    const nextDateStr = nextMarket
      ? nextMarket.date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
      : 'Saturday'
    const nextTimeStr = nextMarket
      ? `${nextMarket.openTime} – ${nextMarket.closeTime}`
      : '8:00 AM – 11:00 AM'

    return (
      <div className="container">
        <div className={styles.closedPage}>
          <div className={styles.closedBox}>
            <div className={styles.closedIcon}>🌙</div>
            <h1 className={styles.closedTitle}>Market is Closed</h1>
            <p className={styles.closedDate}>
              Opens <strong>{nextDateStr}</strong> at <strong>{nextTimeStr}</strong>
            </p>

            {/* Countdown Timer */}
            <div className={styles.countdown}>
              <div className={styles.countdownUnit}>
                <span className={styles.countdownNumber}>{countdown.days}</span>
                <span className={styles.countdownLabel}>days</span>
              </div>
              <span className={styles.countdownSep}>:</span>
              <div className={styles.countdownUnit}>
                <span className={styles.countdownNumber}>{String(countdown.hours).padStart(2, '0')}</span>
                <span className={styles.countdownLabel}>hours</span>
              </div>
              <span className={styles.countdownSep}>:</span>
              <div className={styles.countdownUnit}>
                <span className={styles.countdownNumber}>{String(countdown.minutes).padStart(2, '0')}</span>
                <span className={styles.countdownLabel}>mins</span>
              </div>
              <span className={styles.countdownSep}>:</span>
              <div className={styles.countdownUnit}>
                <span className={styles.countdownNumber}>{String(countdown.seconds).padStart(2, '0')}</span>
                <span className={styles.countdownLabel}>secs</span>
              </div>
            </div>

            <p className={styles.closedSubtext}>
              While you wait, here&apos;s how you can get ready:
            </p>

            <div className={styles.actionGrid}>
              {/* Action 1: List produce */}
              <Link href="/my-booth" className={styles.actionCard}>
                <div className={`${styles.actionIcon} ${styles.actionIconGreen}`}>🥬</div>
                <h3 className={styles.actionTitle}>List Your Excess Produce</h3>
                <p className={styles.actionDesc}>
                  Prepare for market open — add photos, set prices, and quantities for the next market day.
                </p>
                <span className={styles.actionBtn}>Start Listing →</span>
              </Link>

              {/* Action 2: Invite neighbors */}
              <button className={styles.actionCard} onClick={() => {
                const url = `${window.location.origin}/get-started`
                const text = 'Got a neighbor with fruit trees or a veggie garden? Their harvest could feed the block instead of going to waste. Join CasaGrown Market!'
                if (navigator.share) {
                  navigator.share({ title: 'CasaGrown Market', text, url })
                } else {
                  navigator.clipboard?.writeText(`${text}\n${url}`)
                  alert('Link copied to clipboard!')
                }
              }}>
                <div className={`${styles.actionIcon} ${styles.actionIconAmber}`}>📣</div>
                <h3 className={styles.actionTitle}>Invite Your Neighbors</h3>
                <p className={styles.actionDesc}>
                  Know someone who grows produce or loves fresh food? Invite them to share or buy at the market!
                </p>
                <span className={styles.actionBtn}>Share an Invite →</span>
              </button>

              {/* Action 3: Remind me */}
              <button className={styles.actionCard} onClick={() => setShowReminder(!showReminder)}>
                <div className={`${styles.actionIcon} ${styles.actionIconBlue}`}>🔔</div>
                <h3 className={styles.actionTitle}>Remind Me</h3>
                <p className={styles.actionDesc}>
                  Get a push notification before the market opens so you never miss fresh produce.
                </p>
                <span className={styles.actionBtn}>
                  {reminderSet ? '✓ Reminder Set' : 'Set a Reminder →'}
                </span>
              </button>
            </div>

            {/* Reminder Panel */}
            {showReminder && (
              <div className={styles.reminderPanel}>
                {notifPermission === 'unsupported' ? (
                  <div className={styles.reminderInfo}>
                    <p className={styles.reminderTitle}>📱 Enable Notifications</p>
                    <p className={styles.reminderText}>
                      Your browser doesn&apos;t support push notifications. For the best experience:
                    </p>
                    <div className={styles.pwaInstructions}>
                      <div className={styles.pwaStep}>
                        <strong>iOS Safari:</strong> Tap the share button (⬆️) → &quot;Add to Home Screen&quot; → Open from your home screen to enable notifications.
                      </div>
                      <div className={styles.pwaStep}>
                        <strong>Android Chrome:</strong> Tap the menu (⋮) → &quot;Add to Home Screen&quot; or &quot;Install App&quot;.
                      </div>
                    </div>
                  </div>
                ) : notifPermission === 'denied' ? (
                  <div className={styles.reminderInfo}>
                    <p className={styles.reminderTitle}>🚫 Notifications Blocked</p>
                    <p className={styles.reminderText}>
                      You&apos;ve blocked notifications for this site. To enable them:
                    </p>
                    <div className={styles.pwaInstructions}>
                      <div className={styles.pwaStep}>
                        Open your browser settings → Site Settings → Notifications → Allow for this site.
                      </div>
                    </div>
                  </div>
                ) : notifPermission !== 'granted' ? (
                  <div className={styles.reminderInfo}>
                    <p className={styles.reminderTitle}>🔔 Allow Notifications</p>
                    <p className={styles.reminderText}>
                      Click below to allow notifications so we can remind you before the market opens.
                    </p>
                    <button className={styles.reminderPermBtn} onClick={requestNotifPermission}>
                      Allow Notifications
                    </button>
                    <div className={styles.pwaInstructions}>
                      <div className={styles.pwaStep}>
                        <strong>💡 Tip for iPhone:</strong> Add this page to your Home Screen first (tap ⬆️ → &quot;Add to Home Screen&quot;), then open it from there to enable notifications.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.reminderInfo}>
                    <p className={styles.reminderTitle}>⏰ When should we remind you?</p>
                    <div className={styles.reminderOptions}>
                      {[
                        { value: '15', label: '15 min before' },
                        { value: '30', label: '30 min before' },
                        { value: '60', label: '1 hour before' },
                        { value: '1440', label: '1 day before' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          className={`${styles.reminderOption} ${reminderTime === opt.value ? styles.reminderOptionActive : ''}`}
                          onClick={() => setReminderTime(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button
                      className={styles.reminderSetBtn}
                      onClick={handleSetReminder}
                      disabled={reminderSet}
                    >
                      {reminderSet ? '✓ Reminder Set!' : `Set Reminder for ${nextDateStr}`}
                    </button>
                    {reminderSet && (
                      <p className={styles.reminderConfirm}>
                        We&apos;ll notify you {reminderTime === '1440' ? '1 day' : `${reminderTime} minutes`} before the market opens. Keep this tab open for the notification to fire.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* How It Works — below the closed box */}
          <div className={styles.howItWorks}>
            <h2 className={styles.howTitle}>How CasaGrown Market Works</h2>
            <div className={styles.howSteps}>
              <div className={styles.howStep}>
                <div className={styles.howStepNum}>1</div>
                <div className={styles.howStepIcon}>📸</div>
                <h3 className={styles.howStepTitle}>List Your Produce</h3>
                <p className={styles.howStepDesc}>
                  Snap photos of your excess fruits, veggies, or baked goods. Set your price and quantity.
                </p>
              </div>
              <div className={styles.howArrow}>→</div>
              <div className={styles.howStep}>
                <div className={styles.howStepNum}>2</div>
                <div className={styles.howStepIcon}>📅</div>
                <h3 className={styles.howStepTitle}>Market Day</h3>
                <p className={styles.howStepDesc}>
                  Every Saturday 8–11 AM, the market opens. Neighbors browse your booth and place orders.
                </p>
              </div>
              <div className={styles.howArrow}>→</div>
              <div className={styles.howStep}>
                <div className={styles.howStepNum}>3</div>
                <div className={styles.howStepIcon}>📦</div>
                <h3 className={styles.howStepTitle}>Deliver or Pickup</h3>
                <p className={styles.howStepDesc}>
                  Drop off at their porch or they pick up from you. Snap a photo as proof of delivery.
                </p>
              </div>
              <div className={styles.howArrow}>→</div>
              <div className={styles.howStep}>
                <div className={styles.howStepNum}>4</div>
                <div className={styles.howStepIcon}>💳</div>
                <h3 className={styles.howStepTitle}>Get Paid</h3>
                <p className={styles.howStepDesc}>
                  Earnings are netted automatically. Redeem as gift cards, donate, or cash out via Venmo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Market Open State — existing booth browsing ──

  const filteredBooths = (() => {
    let booths = state.booths
    if (search) {
      const q = search.toLowerCase()
      const matchingBoothIds = new Set<string>()
      state.products.forEach(p => {
        if (p.name.toLowerCase().includes(q) || p.category.includes(q)) {
          matchingBoothIds.add(p.boothId)
        }
      })
      booths = booths.filter(
        b => b.name.toLowerCase().includes(q) || b.ownerName.toLowerCase().includes(q) || matchingBoothIds.has(b.id)
      )
    }
    return booths
  })()

  const boothProducts = (boothId: string) => state.products.filter(p => p.boothId === boothId && p.isActive)

  const themeEmoji: Record<string, string> = {
    rustic: '🪵', tropical: '🌴', minimal: '✨', floral: '🌸', harvest: '🌾', cottage: '🏡',
  }

  return (
    <div className="container">
      {/* Market Status */}
      <div className={`${styles.statusBanner} ${styles.bannerOpen}`}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <strong>🟢 Market is Open!</strong>
        </div>
        <span className={styles.statusRight}>Closing at 11:00 AM</span>
      </div>

      <div className={styles.header}>
        <h1 className="page-title">Browse Market</h1>
        <p className="page-subtitle">Discover fresh produce from your neighbors</p>
      </div>

      {/* Search */}
      <div className={styles.searchBar}>
        <input
          className="input"
          placeholder="🔍 Search booths or produce..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Booth Grid */}
      {filteredBooths.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No booths found</div>
          <div className="empty-state-text">Try adjusting your search</div>
        </div>
      ) : (
        <div className={styles.boothGrid}>
          {filteredBooths.map(booth => {
            const products = boothProducts(booth.id)
            return (
              <Link key={booth.id} href={`/market/booth/${booth.id}`} className={styles.boothCard}>
                <div className={styles.boothHeader}>
                  <span className={styles.boothTheme}>{themeEmoji[booth.decorativeTheme] || '🌿'}</span>
                  <div>
                    <h3 className={styles.boothName}>{booth.name}</h3>
                    <p className={styles.boothOwner}>by {booth.ownerName}</p>
                  </div>
                </div>
                <p className={styles.boothDesc}>{booth.description}</p>
                <div className={styles.boothMeta}>
                  <span className="badge badge-green">{products.length} products</span>
                </div>
                <div className={styles.boothFooter}>
                  <span className={styles.boothRating}>⭐ {booth.rating}</span>
                  <span className={styles.boothSales}>{booth.totalSales} sales</span>
                </div>
                {products.length > 0 && (
                  <div className={styles.productPreview}>
                    {products.slice(0, 4).map(p => (
                      <div key={p.id} className={styles.previewThumb}>
                        <img src={p.photos[0]} alt={p.name} />
                      </div>
                    ))}
                    {products.length > 4 && (
                      <div className={styles.previewMore}>+{products.length - 4}</div>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
