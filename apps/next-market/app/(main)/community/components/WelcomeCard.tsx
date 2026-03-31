'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../lib/supabase'
import styles from '../page.module.css'

interface WelcomeCardProps {
  userId: string
  userName: string
  profileH3: string
  onComplete: () => void
  onSendMessage: (msg: string) => Promise<void>
  showPrompt: () => void
}

interface ProduceItem {
  name: string
  emoji: string
  category: string
}

// Fallback produce list if USDA zone lookup fails
const DEFAULT_PRODUCES: ProduceItem[] = [
  { name: 'Tomatoes', emoji: '🍅', category: 'fruits' },
  { name: 'Basil', emoji: '🌿', category: 'herbs' },
  { name: 'Peppers', emoji: '🫑', category: 'vegetables' },
  { name: 'Cucumbers', emoji: '🥒', category: 'vegetables' },
  { name: 'Zucchini', emoji: '🥒', category: 'vegetables' },
  { name: 'Lettuce', emoji: '🥬', category: 'vegetables' },
  { name: 'Strawberries', emoji: '🍓', category: 'fruits' },
  { name: 'Mint', emoji: '🌿', category: 'herbs' },
  { name: 'Roses', emoji: '🌹', category: 'flowers' },
  { name: 'Sunflowers', emoji: '🌻', category: 'flowers' },
  { name: 'Lemons', emoji: '🍋', category: 'citrus' },
  { name: 'Honey', emoji: '🍯', category: 'honey' },
  { name: 'Eggs', emoji: '🥚', category: 'eggs' },
  { name: 'Avocados', emoji: '🥑', category: 'fruits' },
  { name: 'Cilantro', emoji: '🌿', category: 'herbs' },
  { name: 'Lavender', emoji: '💜', category: 'flowers' },
]

export default function WelcomeCard({ userId, userName, profileH3, onComplete, onSendMessage, showPrompt }: WelcomeCardProps) {
  const supabase = createClient()
  const [step, setStep] = useState(0) // 0=welcome, 1=produces, 2=intro
  const [produces, setProduces] = useState<ProduceItem[]>(DEFAULT_PRODUCES)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customInput, setCustomInput] = useState('')
  const [introMessage, setIntroMessage] = useState('')
  const [notifyOnSearch, setNotifyOnSearch] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load zone-specific produces
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('usda_zone_produce')
        .select('produce_name, emoji, category')
        .order('produce_name')
      if (data && data.length > 0) {
        // Deduplicate
        const seen = new Set<string>()
        const unique: ProduceItem[] = []
        for (const p of data) {
          const key = p.produce_name.toLowerCase()
          if (!seen.has(key)) {
            seen.add(key)
            unique.push({ name: p.produce_name, emoji: p.emoji, category: p.category })
          }
        }
        setProduces(unique)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProduce = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const addCustom = () => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    // Add to produces list if not already there
    if (!produces.find(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setProduces(prev => [...prev, { name: trimmed, emoji: '🌱', category: 'other' }])
    }
    setSelected(prev => new Set(prev).add(trimmed))
    setCustomInput('')
  }

  const selectedList = Array.from(selected)

  const handleSave = async () => {
    setSaving(true)
    try {
      // 1. Save grower produces
      if (selectedList.length > 0) {
        const rows = selectedList.map(name => {
          const p = produces.find(pr => pr.name === name)
          return {
            user_id: userId,
            produce_name: name,
            category: p?.category || 'other',
            notify_on_search: notifyOnSearch,
          }
        })
        await supabase.from('grower_produces').upsert(rows, { onConflict: 'user_id,produce_name' })
      }

      // 2. Post intro message if provided
      if (introMessage.trim()) {
        await onSendMessage(introMessage.trim())
      }

      // 3. Mark welcome complete
      await supabase
        .from('profiles')
        .update({ buzz_welcomed_at: new Date().toISOString() })
        .eq('id', userId)

      // 4. Prompt for push notifications if they want search alerts
      if (notifyOnSearch && selectedList.length > 0) {
        showPrompt()
      }

      onComplete()
    } catch (err) {
      console.warn('Welcome save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    await supabase
      .from('profiles')
      .update({ buzz_welcomed_at: new Date().toISOString() })
      .eq('id', userId)
    onComplete()
  }

  // Build default intro message
  useEffect(() => {
    if (selectedList.length > 0) {
      const produceEmojis = selectedList.map(name => {
        const p = produces.find(pr => pr.name === name)
        return `${p?.emoji || '🌱'} ${name}`
      }).join(', ')
      setIntroMessage(
        `👋 Hi neighbors! I'm ${userName || 'new here'} and I grow ${produceEmojis}. Looking forward to sharing with the community! 🌱`
      )
    }
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.welcomeCard}>
      {/* CasaBot avatar */}
      <div className={styles.welcomeHeader}>
        <div className={styles.welcomeAvatar}>🐝</div>
        <div>
          <strong className={styles.welcomeName}>CasaGrown</strong>
          <span className={styles.welcomeBadge}>Welcome</span>
        </div>
      </div>

      {step === 0 && (
        <div className={styles.welcomeBody}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--gray-800)' }}>
            Welcome to Buzz! 🐝
          </h3>
          <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Your <strong>neighborhood marketplace</strong> — here you can:
          </p>
          <ul style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.8, margin: '0 0 16px', paddingLeft: 20 }}>
            <li>🌱 Sell excess produce &amp; gardening items to your neighbors</li>
            <li>🛒 Buy fresh produce &amp; gardening items from neighbors nearby</li>
            <li>🥗 Eat fresh, eat local — and save money while doing it</li>
            <li>🤖 Get gardening tips from your community &amp; CasaBot AI</li>
          </ul>
          <button
            className={styles.welcomeBtn}
            onClick={() => setStep(1)}
          >
            Tell us what you grow 🌿
          </button>
          <button className={styles.welcomeSkip} onClick={handleSkip}>
            Skip for now
          </button>
        </div>
      )}

      {step === 1 && (
        <div className={styles.welcomeBody}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: 'var(--gray-800)' }}>
            What do you grow? 🌱
          </h3>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
            Tap to select — your neighbors will know what you have to offer.
          </p>

          <div className={styles.produceChips}>
            {produces.map(p => (
              <button
                key={p.name}
                className={`${styles.produceChip} ${selected.has(p.name) ? styles.produceChipActive : ''}`}
                onClick={() => toggleProduce(p.name)}
              >
                {p.emoji} {p.name}
              </button>
            ))}
          </div>

          {/* Free-form input */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              className={styles.welcomeInput}
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              placeholder="Add something else..."
            />
            <button
              className={styles.welcomeBtnSm}
              onClick={addCustom}
              disabled={!customInput.trim()}
            >
              + Add
            </button>
          </div>

          {/* Selected items summary */}
          {selectedList.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-700)', margin: '0 0 6px' }}>
                🌱 You grow ({selectedList.length}):
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedList.map(name => {
                  const p = produces.find(pr => pr.name === name)
                  return (
                    <span
                      key={name}
                      style={{
                        padding: '3px 10px', borderRadius: 14,
                        background: 'var(--green-100)', color: 'var(--green-800)',
                        fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {p?.emoji || '🌱'} {name}
                      <button
                        onClick={() => toggleProduce(name)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--gray-500)', padding: '0 0 0 2px' }}
                      >×</button>
                    </span>
                  )
                })}
              </div>

              {/* Notification opt-in */}
              <label className={styles.welcomeToggle} style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={notifyOnSearch}
                  onChange={e => setNotifyOnSearch(e.target.checked)}
                />
                <div>
                  <span style={{ fontWeight: 600 }}>🔔 Notify me when neighbors search for what I grow</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                    {typeof Notification !== 'undefined' && Notification.permission === 'denied'
                      ? '⚠️ Notifications are blocked. Enable them in your browser settings to receive alerts.'
                      : 'We\u2019ll send you a push notification so you can list it on the market.'}
                  </span>
                </div>
              </label>
            </div>
          )}

          <button
            className={styles.welcomeBtn}
            onClick={() => setStep(2)}
            disabled={selectedList.length === 0}
            style={selectedList.length === 0 ? { opacity: 0.5 } : undefined}
          >
            Next: Introduce yourself →
          </button>
          <button className={styles.welcomeSkip} onClick={() => { setStep(2) }}>
            Skip produce selection
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={styles.welcomeBody}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: 'var(--gray-800)' }}>
            Say hello to your neighbors! 👋
          </h3>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
            Edit the message below and post it to Buzz, or skip.
          </p>
          <textarea
            className={styles.welcomeTextarea}
            value={introMessage}
            onChange={e => setIntroMessage(e.target.value)}
            rows={4}
            placeholder="Hi neighbors! I&apos;m new here and I grow..."
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className={styles.welcomeBtn}
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? 'Posting...' : introMessage.trim() ? '🐝 Post & Join Buzz' : '✅ Join Buzz'}
            </button>
            <button
              className={styles.welcomeSkip}
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 0 }}
            >
              {saving ? '...' : 'Skip'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
