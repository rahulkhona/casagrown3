'use client'

/**
 * MarketClosedBox — Full-page takeover shown on the market page when the market is closed.
 * 
 * Restored from the original market page (git commit 33d4ec4).
 * Original design: white card, dark countdown bar, green accents, 3 action cards,
 * 4-step "How It Works" section.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

interface MarketClosedBoxProps {
  nextOpenDate: Date | null
  todaySchedule: { open_time: string; close_time: string } | null
}

// ── Countdown Timer Hook (from original) ──
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

function pad(n: number) { return String(n).padStart(2, '0') }

export default function MarketClosedBox({ nextOpenDate, todaySchedule }: MarketClosedBoxProps) {
  const countdown = useCountdown(nextOpenDate)
  const supabase = createClient()
  const { user, isAuthenticated, profileComplete } = useAuth()

  // Reminder state (from original)
  const [showReminder, setShowReminder] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [reminderSet, setReminderSet] = useState(false)
  const [reminderTime, setReminderTime] = useState('30')

  const nextDateStr = nextOpenDate
    ? nextOpenDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'the next market day'
  const nextTimeStr = todaySchedule
    ? `${todaySchedule.open_time} – ${todaySchedule.close_time}`
    : nextOpenDate
      ? nextOpenDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : ''

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission)
    } else {
      setNotifPermission('unsupported')
    }
  }, [])

  // Check if user already has a reminder for next market
  useEffect(() => {
    if (!user || !nextOpenDate) return
    supabase
      .from('market_reminders')
      .select('id, reminder_minutes')
      .eq('user_id', user.id)
      .eq('market_date', nextOpenDate.toISOString())
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setReminderSet(true)
          setReminderTime(String(data.reminder_minutes))
        }
      })
  }, [user, nextOpenDate?.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Gate: require login + profile
    if (!isAuthenticated) {
      window.location.href = '/login?redirect=/market'
      return
    }
    if (profileComplete !== true) {
      window.location.href = '/profile-setup'
      return
    }
    if (notifPermission !== 'granted') {
      requestNotifPermission()
      return
    }
    if (!user || !nextOpenDate) return

    const minutes = parseInt(reminderTime)
    const remindAt = new Date(nextOpenDate.getTime() - minutes * 60 * 1000)

    const { error } = await supabase
      .from('market_reminders')
      .upsert({
        user_id: user.id,
        market_date: nextOpenDate.toISOString(),
        remind_at: remindAt.toISOString(),
        reminder_minutes: minutes,
      }, { onConflict: 'user_id,market_date' })

    if (error) {
      console.error('Failed to save reminder:', error.message)
      return
    }
    setReminderSet(true)
  }

  return (
    <div className="container">
      {/* ── Closed Page layout (matching original closedPage class) ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '40px 0 60px', gap: 48,
      }}>
        {/* ── Closed Box (white card, matching original closedBox) ── */}
        <div style={{
          textAlign: 'center', maxWidth: 720, width: '100%',
          background: '#fff', borderRadius: 'var(--radius-xl, 16px)',
          boxShadow: 'var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.08))',
          padding: '48px 32px',
          border: '1px solid var(--gray-100, #f3f4f6)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🌙</div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, color: 'var(--gray-900, #111827)',
            marginBottom: 8, letterSpacing: '-0.02em',
          }}>
            Market is Closed
          </h1>
          <p style={{
            fontSize: 16, color: 'var(--gray-600, #4b5563)',
            marginBottom: 12, lineHeight: 1.6,
          }}>
            Opens <strong style={{ color: 'var(--green-700, #15803d)' }}>{nextDateStr}</strong>
            {nextTimeStr && <> at <strong style={{ color: 'var(--green-700, #15803d)' }}>{nextTimeStr}</strong></>}
          </p>

          {/* Countdown Timer (dark bar, matching original) */}
          {nextOpenDate && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--gray-900, #111827)', borderRadius: 'var(--radius-xl, 16px)',
              padding: '16px 28px', marginBottom: 24,
            }}>
              {countdown.days > 0 && (
                <>
                  <CountdownUnit value={countdown.days} label="days" />
                  <span style={sepStyle}>:</span>
                </>
              )}
              <CountdownUnit value={pad(countdown.hours)} label="hours" />
              <span style={sepStyle}>:</span>
              <CountdownUnit value={pad(countdown.minutes)} label="mins" />
              <span style={sepStyle}>:</span>
              <CountdownUnit value={pad(countdown.seconds)} label="secs" />
            </div>
          )}

          <p style={{
            fontSize: 14, color: 'var(--gray-400, #9ca3af)', marginBottom: 28,
          }}>
            While you wait, here&apos;s how you can get ready:
          </p>

          {/* Action Cards — 3-col grid on desktop, compact horizontal rows on mobile */}
          <style>{`
            .market-closed-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
            .market-closed-actions .mc-card { min-height: 220px; }
            @media (max-width: 640px) {
              .market-closed-actions { grid-template-columns: 1fr; gap: 10px; }
              .market-closed-actions .mc-card {
                flex-direction: row !important; min-height: auto !important;
                padding: 14px 16px !important; gap: 14px !important; text-align: left !important;
              }
              .market-closed-actions .mc-card .mc-icon { width: 44px; height: 44px; min-width: 44px; font-size: 20px; border-radius: 12px; }
              .market-closed-actions .mc-card .mc-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
              .market-closed-actions .mc-card .mc-desc { display: none; }
            }
          `}</style>
          <div className="market-closed-actions">
            {/* Action 1: List produce */}
            <Link href="/my-booth" style={actionCardStyle} className="mc-card">
              <div style={{ ...actionIconStyle, background: 'var(--green-100, #dcfce7)' }} className="mc-icon">🥬</div>
              <div className="mc-body">
                <h3 style={actionTitleStyle}>List Your Excess Produce</h3>
                <p style={actionDescStyle} className="mc-desc">
                  Prepare for market open — add photos, set prices, and quantities for the next market day.
                </p>
                <span style={actionBtnStyle}>Start Listing →</span>
              </div>
            </Link>

            {/* Action 2: Join Community Buzz */}
            <Link href="/community" style={actionCardStyle} className="mc-card">
              <div style={{ ...actionIconStyle, background: 'var(--blue-100, #dbeafe)' }} className="mc-icon">💬</div>
              <div className="mc-body">
                <h3 style={actionTitleStyle}>Join the Community</h3>
                <p style={actionDescStyle} className="mc-desc">
                  Connect with neighbors on Buzz — share gardening tips, coordinate harvests, and build community!
                </p>
                <span style={actionBtnStyle}>Open Buzz →</span>
              </div>
            </Link>

            {/* Action 3: Invite neighbors */}
            <button style={{ ...actionCardStyle, cursor: 'pointer' }} className="mc-card" onClick={async () => {
              const url = `${window.location.origin}/`
              const text = 'Check out CasaGrown — a neighborhood market where you can buy and sell fresh, homegrown produce!'
              if (navigator.share) {
                try { await navigator.share({ title: 'Join CasaGrown Market', url }) } catch { /* user cancelled */ }
              } else {
                navigator.clipboard?.writeText(`${text}\n${url}`)
                alert('Invite link copied to clipboard!')
              }
            }}>
              <div style={{ ...actionIconStyle, background: 'var(--amber-100, #fef3c7)' }} className="mc-icon">📣</div>
              <div className="mc-body">
                <h3 style={actionTitleStyle}>Invite Your Neighbors</h3>
                <p style={actionDescStyle} className="mc-desc">
                  Know someone who grows produce or loves fresh food? Invite them to share or buy at the market!
                </p>
                <span style={actionBtnStyle}>Share an Invite →</span>
              </div>
            </button>
          </div>

          {/* ── Remind Me section (full-width, below action cards) ── */}
          <div style={{
            marginTop: 24, padding: '20px 24px',
            borderRadius: 'var(--radius-xl, 16px)',
            background: 'var(--gray-50, #f9fafb)',
            border: '1px solid var(--gray-200, #e5e7eb)',
            textAlign: 'center',
          }}>
            <button
              onClick={() => setShowReminder(!showReminder)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 15, fontWeight: 700, color: 'var(--gray-800, #1f2937)',
              }}
            >
              🔔 {reminderSet ? '✓ Reminder Set' : 'Remind Me When Market Opens'}
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{showReminder ? '▲' : '▼'}</span>
            </button>

            {showReminder && (
              <div style={{ marginTop: 16, textAlign: 'left' }}>
                {notifPermission === 'unsupported' ? (
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', margin: '0 0 8px' }}>📱 Get Notifications on iOS</p>
                    <p style={{ fontSize: 13, color: 'var(--gray-600)', margin: '0 0 12px', lineHeight: 1.5 }}>
                      Apple requires you to save CasaGrown to your Home Screen first. It takes 30 seconds!
                    </p>
                    <div style={{
                      padding: 12, background: 'var(--blue-50, #eff6ff)', borderRadius: 'var(--radius, 8px)',
                      border: '1px solid var(--blue-200, #bfdbfe)', fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.8,
                    }}>
                      <div><strong>Step 1:</strong> Tap the Share button (⬆️) at the bottom of your screen</div>
                      <div><strong>Step 2:</strong> Scroll down and tap &quot;Add to Home Screen&quot;</div>
                      <div><strong>Step 3:</strong> Tap &quot;Add&quot; to confirm</div>
                    </div>
                    <div style={{
                      marginTop: 8, padding: 12, background: 'var(--amber-50, #fffbeb)',
                      borderRadius: 'var(--radius, 8px)', border: '1px solid var(--amber-200, #fde68a)',
                      fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5,
                    }}>
                      ⚠️ <strong>Important:</strong> After adding, close this browser and always open CasaGrown from your Home Screen. It will ask you to allow notifications the first time!
                    </div>
                  </div>
                ) : notifPermission === 'denied' ? (
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', margin: '0 0 8px' }}>🚫 Notifications Blocked</p>
                    <p style={{ fontSize: 13, color: 'var(--gray-600)', margin: 0, lineHeight: 1.5 }}>
                      You&apos;ve blocked notifications for this site. To enable them, open your browser settings → Site Settings → Notifications → Allow for this site.
                    </p>
                  </div>
                ) : notifPermission !== 'granted' ? (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, color: 'var(--gray-600)', margin: '0 0 12px', lineHeight: 1.5 }}>
                      Allow notifications so we can remind you before the market opens.
                    </p>
                    <button onClick={requestNotifPermission} style={{
                      padding: '10px 24px', borderRadius: 'var(--radius-full, 999px)',
                      background: 'var(--green-600, #16a34a)', color: '#fff', border: 'none',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}>
                      Allow Notifications
                    </button>
                    <div style={{
                      marginTop: 12, padding: 12, background: 'var(--amber-50, #fffbeb)',
                      borderRadius: 'var(--radius, 8px)', border: '1px solid var(--amber-200, #fde68a)',
                      fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5,
                    }}>
                      <strong>💡 iPhone/iPad?</strong> Tap ⬆️ → &quot;Add to Home Screen&quot; → then always open CasaGrown from your Home Screen. It will ask you to allow notifications there!
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', margin: '0 0 12px' }}>
                      ⏰ When should we remind you?
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                      {[
                        { value: '15', label: '15 min before' },
                        { value: '30', label: '30 min before' },
                        { value: '60', label: '1 hour before' },
                        { value: '1440', label: '1 day before' },
                      ].map(opt => (
                        <button key={opt.value} onClick={() => setReminderTime(opt.value)} style={{
                          padding: '8px 16px', borderRadius: 'var(--radius-full, 999px)',
                          border: `1px solid ${reminderTime === opt.value ? 'var(--green-600, #16a34a)' : 'var(--gray-300, #d1d5db)'}`,
                          background: reminderTime === opt.value ? 'var(--green-600, #16a34a)' : '#fff',
                          color: reminderTime === opt.value ? '#fff' : 'var(--gray-600, #4b5563)',
                          fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleSetReminder} disabled={reminderSet} style={{
                      padding: '10px 28px', borderRadius: 'var(--radius-full, 999px)',
                      background: reminderSet ? 'var(--gray-300, #d1d5db)' : 'var(--green-600, #16a34a)',
                      color: '#fff', border: 'none', fontSize: 14, fontWeight: 700,
                      cursor: reminderSet ? 'default' : 'pointer',
                    }}>
                      {reminderSet ? '✓ Reminder Set!' : `Set Reminder for ${nextDateStr}`}
                    </button>
                    {reminderSet && (
                      <p style={{ fontSize: 13, color: 'var(--green-600, #16a34a)', marginTop: 8, lineHeight: 1.5 }}>
                        We&apos;ll notify you {reminderTime === '1440' ? '1 day' : `${reminderTime} minutes`} before the market opens.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Weekly Market Schedule Card ── */}
        <div style={{
          maxWidth: 720, width: '100%',
          background: '#fff', borderRadius: 'var(--radius-xl, 16px)',
          boxShadow: 'var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.08))',
          padding: '32px 28px',
          border: '1px solid var(--gray-100, #f3f4f6)',
        }}>
          <h2 style={{
            fontSize: 20, fontWeight: 800, color: 'var(--gray-900, #111827)',
            textAlign: 'center', marginBottom: 24, letterSpacing: '-0.02em',
          }}>
            📅 Weekly Market Schedule
          </h2>

          {/* Schedule Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6,
            marginBottom: 24,
          }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
              const isOpen = i === 6 // Saturday
              return (
                <div key={day} style={{
                  textAlign: 'center', padding: '12px 4px',
                  borderRadius: 'var(--radius-lg, 12px)',
                  background: isOpen ? 'var(--green-600, #16a34a)' : 'var(--gray-50, #f9fafb)',
                  border: isOpen ? 'none' : '1px solid var(--gray-200, #e5e7eb)',
                  transition: 'all 0.2s',
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: isOpen ? 'rgba(255,255,255,0.8)' : 'var(--gray-400, #9ca3af)',
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
                  }}>{day}</div>
                  <div style={{
                    fontSize: isOpen ? 13 : 12, fontWeight: isOpen ? 800 : 500,
                    color: isOpen ? '#fff' : 'var(--gray-300, #d1d5db)',
                  }}>
                    {isOpen ? '8–11 AM' : 'Closed'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Why limited hours */}
          <div style={{
            padding: '16px 20px', borderRadius: 'var(--radius-lg, 12px)',
            background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
            border: '1px solid var(--green-200, #bbf7d0)',
          }}>
            <p style={{
              fontSize: 14, fontWeight: 700, color: 'var(--green-800, #166534)',
              margin: '0 0 6px',
            }}>
              💡 Why limited hours?
            </p>
            <p style={{
              fontSize: 13, color: 'var(--gray-600, #4b5563)', lineHeight: 1.6, margin: 0,
            }}>
              Just like a real farmer&apos;s market, set hours create a rush of activity — fresher produce, 
              more neighbors shopping together, and fairer access for everyone. List your produce anytime, 
              and when the market opens, the magic happens!
            </p>
          </div>

          {/* Buzz always-on note */}
          <div style={{
            marginTop: 12, padding: '12px 20px', borderRadius: 'var(--radius-lg, 12px)',
            background: 'var(--gray-50, #f9fafb)', border: '1px solid var(--gray-200, #e5e7eb)',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 13, color: 'var(--gray-600, #4b5563)', lineHeight: 1.6, margin: 0 }}>
              🐝 While the market has set hours, <Link href="/community" style={{ color: 'var(--green-700, #15803d)', fontWeight: 700, textDecoration: 'none' }}>Buzz</Link> is always on — post, discuss, and connect with your local community anytime!
            </p>
          </div>
        </div>

        {/* ── How It Works (matching original howItWorks) ── */}
        <div style={{ maxWidth: 720, width: '100%', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 24, fontWeight: 800, color: 'var(--gray-900, #111827)',
            marginBottom: 32, letterSpacing: '-0.02em',
          }}>
            How CasaGrown Market Works
          </h2>
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            gap: 8, flexWrap: 'wrap',
          }}>
            <HowStep num={1} icon="📸" title="List Your Produce"
              desc="Snap photos of your excess fruits, veggies, or baked goods. Set your price and quantity. Open or close your booth before each market day." />
            <Arrow />
            <HowStep num={2} icon="📅" title="Market Day"
              desc="When the market opens, neighbors browse your booth and place orders." />
            <Arrow />
            <HowStep num={3} icon="📦" title="Deliver or Pickup"
              desc="Drop off at their porch or they pick up from you. Snap a photo as proof of delivery." />
            <Arrow />
            <HowStep num={4} icon="⚖️" title="Daily Settlement"
              desc="At market close, all orders are netted. Sales minus purchases and fees = your net earnings." />
            <Arrow />
            <HowStep num={5} icon="💰" title="Withdraw"
              desc="Funds clear in ~2 days. Cash out via Venmo or PayPal, redeem as gift cards, or donate to charity." />
          </div>

          {/* Settlement Process Detail */}
          <div style={{
            marginTop: 32, maxWidth: 680, margin: '32px auto 0',
            padding: '24px 20px', borderRadius: 'var(--radius-xl, 16px)',
            background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5, #f0f9ff)',
            border: '1px solid var(--green-200, #bbf7d0)',
          }}>
            <h3 style={{
              textAlign: 'center', fontSize: 16, fontWeight: 700,
              color: 'var(--gray-800, #1f2937)', marginBottom: 16,
            }}>🏦 How Daily Settlement Works</h3>
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              gap: 6, flexWrap: 'wrap',
            }}>
              <SettlementStep icon="🔔" title="Market Closes" desc="Orders finalized at 11 AM" />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-400, #4ade80)', marginTop: 10 }}>→</span>
              <SettlementStep icon="⚖️" title="Netting" desc="Sales − purchases − fees = net" />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-400, #4ade80)', marginTop: 10 }}>→</span>
              <SettlementStep icon="💳" title="Capture" desc="Only the net amount is charged" />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-400, #4ade80)', marginTop: 10 }}>→</span>
              <SettlementStep icon="⏳" title="Clearance" desc="~2 days for bank transfer" />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-400, #4ade80)', marginTop: 10 }}>→</span>
              <SettlementStep icon="🎉" title="Withdraw" desc="Venmo, PayPal, gift cards, or donate" />
            </div>
            <p style={{
              fontSize: 12, color: 'var(--gray-500, #6b7280)',
              textAlign: 'center', margin: '14px 0 0', paddingTop: 12,
              borderTop: '1px solid var(--green-200, #bbf7d0)', lineHeight: 1.5,
            }}>
              💡 Netting saves you money — if you buy $5 and sell $20, only $15 net is processed!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function CountdownUnit({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
      <div style={{
        fontSize: 28, fontWeight: 800, color: '#fff',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10, color: 'var(--gray-400, #9ca3af)',
        textTransform: 'uppercase', letterSpacing: 1, marginTop: 4,
      }}>
        {label}
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <span style={{
      fontSize: 20, color: 'var(--green-400, #4ade80)', fontWeight: 700,
      marginTop: 40, flexShrink: 0,
    }}>→</span>
  )
}

function HowStep({ num, icon, title, desc }: { num: number; icon: string; title: string; desc: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, maxWidth: 170, display: 'flex',
      flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--green-600, #16a34a)', color: '#fff',
        fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{num}</div>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800, #1f2937)' }}>{title}</h3>
      <p style={{ fontSize: 12, color: 'var(--gray-500, #6b7280)', lineHeight: 1.5, margin: 0 }}>{desc}</p>
    </div>
  )
}

function SettlementStep({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, textAlign: 'center', flex: 1, minWidth: 80, maxWidth: 110,
    }}>
      <div style={{
        fontSize: 22, width: 40, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fff', borderRadius: '50%',
        border: '2px solid var(--green-200, #bbf7d0)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
      }}>{icon}</div>
      <strong style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-800, #1f2937)' }}>{title}</strong>
      <span style={{ fontSize: 10, color: 'var(--gray-500, #6b7080)', lineHeight: 1.3 }}>{desc}</span>
    </div>
  )
}

// ── Styles (matching original CSS) ──

const sepStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, color: 'var(--green-500, #22c55e)',
  lineHeight: 1.2, marginBottom: 12,
}

const actionCardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
  padding: '24px 16px', borderRadius: 'var(--radius-xl, 16px)',
  border: '1px solid var(--gray-200, #e5e7eb)', background: 'var(--gray-50, #f9fafb)',
  textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s',
  textAlign: 'center', color: 'inherit',
}

const actionIconStyle: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 'var(--radius-lg, 12px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
}

const actionTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--gray-800, #1f2937)', margin: 0,
}

const actionDescStyle: React.CSSProperties = {
  fontSize: 13, color: 'var(--gray-500, #6b7280)', lineHeight: 1.5, flex: 1, margin: 0,
}

const actionBtnStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--green-600, #16a34a)', marginTop: 'auto',
}
