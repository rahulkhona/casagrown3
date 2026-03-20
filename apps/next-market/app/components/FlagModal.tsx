'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import { trackFormSubmit, trackError } from '../../lib/analytics'
import styles from './FlagModal.module.css'

const FLAG_REASONS = [
  { value: 'offensive', label: 'Offensive content', icon: '⚠️' },
  { value: 'misleading', label: 'Misleading description', icon: '🔍' },
  { value: 'prohibited', label: 'Prohibited item', icon: '🚫' },
  { value: 'other', label: 'Other', icon: '📝' },
]

interface FlagModalProps {
  productId: string
  productName: string
  onClose: () => void
  onFlagged: () => void
}

export function FlagModal({ productId, productName, onClose, onFlagged }: FlagModalProps) {
  const supabase = createClient()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason'); return }
    trackFormSubmit('flag_product', { productId, reason })
    setLoading(true)
    setError('')

    const { error: insertErr } = await supabase
      .from('product_flags')
      .insert({ product_id: productId, reason, details: details.trim() || null })

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('You have already flagged this product')
      } else {
        trackError('flag_product_failed', { productId, error: insertErr.message })
        setError(insertErr.message)
      }
      setLoading(false)
      return
    }

    onFlagged()
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>🚩 Flag Product</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.subtitle}>
          Report <strong>{productName}</strong> for inappropriate content
        </p>

        <div className={styles.reasons}>
          {FLAG_REASONS.map(r => (
            <button
              key={r.value}
              className={`${styles.reasonBtn} ${reason === r.value ? styles.reasonSelected : ''}`}
              onClick={() => { setReason(r.value); setError('') }}
            >
              <span className={styles.reasonIcon}>{r.icon}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>

        <textarea
          className={styles.details}
          placeholder="Additional details (optional)"
          value={details}
          onChange={e => setDetails(e.target.value)}
          rows={3}
          maxLength={500}
        />

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading || !reason}
          >
            {loading ? 'Submitting...' : 'Submit Flag'}
          </button>
        </div>

        <p className={styles.note}>
          Products with multiple flags are automatically hidden pending admin review.
        </p>
      </div>
    </div>
  )
}
