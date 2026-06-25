'use client'

import { useEffect, useState } from 'react'
import { adminApi } from '../../../../lib/adminApi'
import styles from './page.module.css'

// ── Types ────────────────────────────────────────────────────────────────────

type Slot = {
  day: string
  start: string
  end: string
}

const DAYS = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
] as const

const DEFAULT_EMAIL_SLOTS: Slot[] = [
  { day: 'tue', start: '09:00', end: '11:00' },
  { day: 'thu', start: '14:00', end: '16:00' },
]

const DEFAULT_SMS_SLOTS: Slot[] = [
  { day: 'wed', start: '10:00', end: '12:00' },
  { day: 'fri', start: '13:00', end: '15:00' },
]

export default function SendSlotsPage() {
  const [emailSlots, setEmailSlots] = useState<Slot[]>(DEFAULT_EMAIL_SLOTS)
  const [smsSlots, setSmsSlots] = useState<Slot[]>(DEFAULT_SMS_SLOTS)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDefaults() }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  async function loadDefaults() {
    try {
      const { data, error } = await adminApi.select('crm_send_slot_defaults', '*')
      if (error) throw new Error(String(error))
      if (data && data.length > 0) {
        const row = data[0]
        setExistingId(row.id)
        if (row.email_slots?.length) setEmailSlots(row.email_slots)
        if (row.sms_slots?.length) setSmsSlots(row.sms_slots)
      }
    } catch (err: any) {
      console.error('Error loading defaults:', err.message)
    } finally {
      setLoading(false)
    }
  }

  function validateSlots(slots: Slot[]): string | null {
    for (let i = 0; i < slots.length; i++) {
      const s1 = slots[i]
      if (!s1.start || !s1.end) {
        return 'Please fill in start and end times for all slots.'
      }
      if (s1.start >= s1.end) {
        const dayLabel = DAYS.find(d => d.value === s1.day)?.label || s1.day
        return `Start time (${s1.start}) must be before end time (${s1.end}) on ${dayLabel}.`
      }
      for (let j = i + 1; j < slots.length; j++) {
        const s2 = slots[j]
        if (s1.day === s2.day) {
          if (s1.start === s2.start && s1.end === s2.end) {
            const dayLabel = DAYS.find(d => d.value === s1.day)?.label || s1.day
            return `Duplicate slot found on ${dayLabel}: ${s1.start} - ${s1.end}.`
          }
          if (s1.start < s2.end && s2.start < s1.end) {
            const dayLabel = DAYS.find(d => d.value === s1.day)?.label || s1.day
            return `Overlapping slots found on ${dayLabel}: ${s1.start}-${s1.end} and ${s2.start}-${s2.end}.`
          }
        }
      }
    }
    return null
  }

  async function handleSave() {
    const emailErr = validateSlots(emailSlots)
    if (emailErr) {
      setToast({ msg: `Email slots: ${emailErr}`, type: 'error' })
      return
    }
    const smsErr = validateSlots(smsSlots)
    if (smsErr) {
      setToast({ msg: `SMS slots: ${smsErr}`, type: 'error' })
      return
    }

    setSaving(true)
    try {
      const payload = { email_slots: emailSlots, sms_slots: smsSlots }
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

  function updateSlot(channel: 'email' | 'sms', index: number, field: keyof Slot, value: string) {
    const setter = channel === 'email' ? setEmailSlots : setSmsSlots
    setter(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  function addSlot(channel: 'email' | 'sms') {
    const setter = channel === 'email' ? setEmailSlots : setSmsSlots
    setter(prev => [...prev, { day: 'mon', start: '09:00', end: '17:00' }])
  }

  function removeSlot(channel: 'email' | 'sms', index: number) {
    const setter = channel === 'email' ? setEmailSlots : setSmsSlots
    setter(prev => prev.filter((_, i) => i !== index))
  }

  function renderSlotTable(channel: 'email' | 'sms', slots: Slot[], emoji: string, title: string) {
    return (
      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <h3 className={styles.formTitle}>{emoji} {title}</h3>
          <button className={styles.btnSecondary} onClick={() => addSlot(channel)}>+ Add Row</button>
        </div>

        {slots.length === 0 ? (
          <div className={styles.empty}>
            No send windows configured. Click &quot;+ Add Row&quot; to add one.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Day of Week</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        className={styles.slotSelect}
                        value={slot.day}
                        onChange={e => updateSlot(channel, i, 'day', e.target.value)}
                      >
                        {DAYS.map(d => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="time"
                        className={styles.slotTime}
                        value={slot.start}
                        onChange={e => updateSlot(channel, i, 'start', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className={styles.slotTime}
                        value={slot.end}
                        onChange={e => updateSlot(channel, i, 'end', e.target.value)}
                      />
                    </td>
                    <td>
                      <button className={styles.btnDanger} onClick={() => removeSlot(channel, i)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className={styles.hint}>
          {channel === 'email'
            ? 'These windows define when emails are sent based on the recipient\'s local timezone.'
            : 'These windows define when SMS messages are sent based on the recipient\'s local timezone.'}
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
            Configure default time windows for sending emails and SMS. Drip sequences with a
            &quot;Wait for Optimal Slot&quot; node will hold messages until the recipient&apos;s local time
            falls within one of these windows.
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

      {/* Email Slots */}
      {renderSlotTable('email', emailSlots, '✉️', 'Email Send Windows')}

      {/* SMS Slots */}
      {renderSlotTable('sms', smsSlots, '💬', 'SMS Send Windows')}

      {/* Save */}
      <div className={styles.formActions}>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Defaults'}
        </button>
      </div>
    </div>
  )
}
