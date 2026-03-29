'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import styles from './BlockModal.module.css'

interface BlockModalProps {
  userIdToBlock: string
  userName: string
  currentUserId: string
  onClose: () => void
  onBlocked: () => void
}

export function BlockModal({ userIdToBlock, userName, currentUserId, onClose, onBlocked }: BlockModalProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    const { error: insertErr } = await supabase
      .from('market_blocks')
      .insert({ blocker_id: currentUserId, blocked_id: userIdToBlock })

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('You have already blocked this neighbor.')
      } else {
        setError(insertErr.message)
      }
      setLoading(false)
      return
    }

    onBlocked()
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>🚫 Block Neighbor</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.subtitle}>
          Are you sure you want to block <strong>{userName}</strong>? You will no longer receive Direct Messages from them, and their visibility will be restricted across your feeds.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Blocking...' : 'Confirm Block'}
          </button>
        </div>
      </div>
    </div>
  )
}
