'use client'

import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import { adminApi } from '../../../../lib/adminApi'
import styles from './page.module.css'

// ── Types ────────────────────────────────────────────────────────────────────

type Slot = {
  day: string
  start: string
  end: string
}

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
] as const

// 8 AM to 8 PM in 1-hour blocks
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // [8, 9, ..., 19]

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

/** Convert the flat slot array [{day, start, end}] into a Set of "day|hour" keys for O(1) lookup */
function slotsToKeys(slots: Slot[]): Set<string> {
  const keys = new Set<string>()
  for (const slot of slots) {
    const startH = parseInt(slot.start.split(':')[0])
    const endH = parseInt(slot.end.split(':')[0])
    for (let h = startH; h < endH; h++) {
      keys.add(`${slot.day}|${h}`)
    }
  }
  return keys
}

/** Convert a Set of "day|hour" keys back into a consolidated slot array */
function keysToSlots(keys: Set<string>): Slot[] {
  const slots: Slot[] = []
  for (const day of DAYS) {
    // Find all active hours for this day, sorted
    const activeHours = HOURS.filter(h => keys.has(`${day.value}|${h}`)).sort((a, b) => a - b)
    if (activeHours.length === 0) continue

    // Merge consecutive hours into ranges
    let rangeStart = activeHours[0]
    let rangeEnd = activeHours[0] + 1

    for (let i = 1; i < activeHours.length; i++) {
      if (activeHours[i] === rangeEnd) {
        rangeEnd = activeHours[i] + 1
      } else {
        slots.push({
          day: day.value,
          start: `${String(rangeStart).padStart(2, '0')}:00`,
          end: `${String(rangeEnd).padStart(2, '0')}:00`,
        })
        rangeStart = activeHours[i]
        rangeEnd = activeHours[i] + 1
      }
    }
    slots.push({
      day: day.value,
      start: `${String(rangeStart).padStart(2, '0')}:00`,
      end: `${String(rangeEnd).padStart(2, '0')}:00`,
    })
  }
  return slots
}

export default function SendSlotsPage() {
  const [emailKeys, setEmailKeys] = useState<Set<string>>(new Set())
  const [smsKeys, setSmsKeys] = useState<Set<string>>(new Set())
  const [existingId, setExistingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)

  // Drag-to-select state
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add')
  const [dragChannel, setDragChannel] = useState<'email' | 'sms'>('email')
  const dragRef = useRef({ isDragging: false, mode: 'add' as 'add' | 'remove', channel: 'email' as 'email' | 'sms' })

  useEffect(() => { loadDefaults() }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Global mouseup to end drag
  useEffect(() => {
    const onUp = () => {
      setIsDragging(false)
      dragRef.current.isDragging = false
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  async function loadDefaults() {
    try {
      const { data, error } = await adminApi.select('crm_send_slot_defaults', '*')
      if (error) throw new Error(String(error))
      if (data && data.length > 0) {
        const row = data[0]
        setExistingId(row.id)
        if (row.email_slots?.length) setEmailKeys(slotsToKeys(row.email_slots))
        if (row.sms_slots?.length) setSmsKeys(slotsToKeys(row.sms_slots))
      }
    } catch (err: any) {
      console.error('Error loading defaults:', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        email_slots: keysToSlots(emailKeys),
        sms_slots: keysToSlots(smsKeys),
      }
      if (existingId) {
        const { error } = await adminApi.update('crm_send_slot_defaults', payload, { eq: { id: existingId } })
        if (error) throw new Error(String(error))
      } else {
        const { data, error } = await adminApi.upsert('crm_send_slot_defaults', payload)
        if (error) throw new Error(String(error))
        if (data?.[0]?.id) setExistingId(data[0].id)
      }
      setToast({ msg: 'Send window defaults saved successfully!', type: 'success' })
    } catch (err: any) {
      setToast({ msg: `Error: ${err.message}`, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function toggleCell(channel: 'email' | 'sms', day: string, hour: number) {
    const setter = channel === 'email' ? setEmailKeys : setSmsKeys
    const key = `${day}|${hour}`
    setter(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function handleCellMouseDown(channel: 'email' | 'sms', day: string, hour: number) {
    const keys = channel === 'email' ? emailKeys : smsKeys
    const key = `${day}|${hour}`
    const mode = keys.has(key) ? 'remove' : 'add'
    setIsDragging(true)
    setDragMode(mode)
    setDragChannel(channel)
    dragRef.current = { isDragging: true, mode, channel }
    // Toggle the initial cell
    toggleCell(channel, day, hour)
  }

  function handleCellMouseEnter(channel: 'email' | 'sms', day: string, hour: number) {
    if (!dragRef.current.isDragging || dragRef.current.channel !== channel) return
    const setter = channel === 'email' ? setEmailKeys : setSmsKeys
    const key = `${day}|${hour}`
    setter(prev => {
      const next = new Set(prev)
      if (dragRef.current.mode === 'add') {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  function clearAll(channel: 'email' | 'sms') {
    const setter = channel === 'email' ? setEmailKeys : setSmsKeys
    setter(new Set())
  }

  function renderCalendarGrid(channel: 'email' | 'sms', keys: Set<string>, emoji: string, title: string) {
    const activeCount = keys.size
    return (
      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <div>
            <h3 className={styles.formTitle}>{emoji} {title}</h3>
            <p className={styles.activeCount}>
              <span className={styles.activeCountNum}>{activeCount}</span> hour slot{activeCount !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button className={styles.btnOutlineDanger} onClick={() => clearAll(channel)}>Clear All</button>
        </div>

        <div className={styles.calendarWrap}>
          <div className={styles.calendarGrid}>
            {/* Header row */}
            <div className={styles.calendarCorner}>Time</div>
            {DAYS.map(d => (
              <div key={d.value} className={styles.calendarHeader}>{d.label}</div>
            ))}

            {/* Hour rows */}
            {HOURS.map(hour => (
              <Fragment key={hour}>
                <div key={`label-${hour}`} className={styles.calendarTimeLabel}>
                  {hourLabel(hour)}
                </div>
                {DAYS.map(d => {
                  const key = `${d.value}|${hour}`
                  const isActive = keys.has(key)
                  return (
                    <div
                      key={key}
                      className={isActive ? styles.calendarCellActive : styles.calendarCell}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleCellMouseDown(channel, d.value, hour)
                      }}
                      onMouseEnter={() => handleCellMouseEnter(channel, d.value, hour)}
                      title={`${d.label} ${hourLabel(hour)} – ${hourLabel(hour + 1)}`}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <div className={styles.legend}>
          <span><span className={styles.legendSwatch} style={{ background: '#22c55e' }} /> Active — messages will send</span>
          <span><span className={styles.legendSwatch} style={{ background: '#fff', border: '1px solid #e5e7eb' }} /> Inactive — messages held</span>
        </div>

        <p className={styles.hint}>
          Click or drag to select 1-hour slots. All times are relative to each recipient&apos;s local timezone.
          {channel === 'email'
            ? ' Interest match digests and drip sequence emails will be sent during these windows.'
            : ' Drip sequence SMS messages will be sent during these windows.'}
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.crmPage}>
        <div className={styles.empty}>Loading send window configuration…</div>
      </div>
    )
  }

  return (
    <div className={styles.crmPage}>
      {/* Header */}
      <div className={styles.crmHeader}>
        <div>
          <h1 className={styles.crmTitle}>Send Windows</h1>
          <p className={styles.crmSubtitle}>
            Configure time windows for sending emails and SMS. Click or drag cells to select
            hourly slots. All times apply to each recipient&apos;s local timezone — a 9 AM slot
            means 9 AM Eastern for NY users and 9 AM Pacific for CA users.
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={toast.type === 'success' ? styles.toastSuccess : styles.toastError}>
          <span>{toast.msg}</span>
          <button className={styles.toastClose} onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Email Calendar */}
      {renderCalendarGrid('email', emailKeys, '✉️', 'Email Send Windows')}

      {/* SMS Calendar */}
      {renderCalendarGrid('sms', smsKeys, '💬', 'SMS Send Windows')}

      {/* Save */}
      <div className={styles.formActions}>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Defaults'}
        </button>
      </div>
    </div>
  )
}
