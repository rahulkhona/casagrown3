'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useErrorToast } from '../../components/ErrorToast'
import styles from './page.module.css'

interface HelpingBooth {
  id: string
  booth_id: string
  booth_name: string
  seller_name: string
  status: string
  created_at: string
  booth_is_active: boolean
}

export default function HelpingPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [booths, setBooths] = useState<HelpingBooth[]>([])
  const [loading, setLoading] = useState(true)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [confirmLeaveId, setConfirmLeaveId] = useState<string | null>(null)
  const { showError, showSuccess } = useErrorToast()

  const supabase = createClient()

  const fetchBooths = useCallback(async () => {
    if (!user) return
    try {
      const { data: helpers, error } = await supabase
        .from('booth_helpers')
        .select('id, booth_id, role, status, created_at')
        .eq('helper_id', user.id)
        .eq('status', 'accepted')
        .order('created_at')

      if (error || !helpers || helpers.length === 0) {
        setBooths([])
        setLoading(false)
        return
      }

      const boothIds = helpers.map(h => h.booth_id)
      const { data: boothRows } = await supabase
        .from('market_booths')
        .select('id, name, owner_id, is_open')
        .in('id', boothIds)

      const ownerIds = Array.from(new Set(boothRows?.map(b => b.owner_id) || []))
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ownerIds)

      const boothMap = new Map(boothRows?.map(b => [b.id, b]) || [])
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

      setBooths(helpers.map(h => {
        const booth = boothMap.get(h.booth_id)
        const seller = booth ? profileMap.get(booth.owner_id) : null
        return {
          id: h.id,
          booth_id: h.booth_id,
          booth_name: booth?.name || 'Unnamed Booth',
          seller_name: seller?.full_name || 'Seller',
          status: h.status,
          created_at: h.created_at,
          booth_is_active: booth?.is_open !== false,
        }
      }))
    } catch (e: any) {
      console.error('Helping page error:', e)
      showError('Failed to load booths: ' + (e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAuthenticated) fetchBooths()
  }, [isAuthenticated, fetchBooths])

  const handleLeaveBooth = useCallback(async (helperRowId: string, boothName: string) => {
    setLeavingId(helperRowId)
    try {
      const { error } = await supabase
        .from('booth_helpers')
        .update({ status: 'left', updated_at: new Date().toISOString() })
        .eq('id', helperRowId)

      if (error) {
        showError('Failed to leave booth: ' + error.message)
      } else {
        showSuccess(`You've left "${boothName}"`)
        setBooths(prev => prev.filter(b => b.id !== helperRowId))
      }
    } catch (e: any) {
      showError('Error: ' + (e.message || 'Unknown error'))
    } finally {
      setLeavingId(null)
      setConfirmLeaveId(null)
    }
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (authLoading) return <LoadingSpinner />
  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2>Sign in to view your helping assignments</h2>
        <Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link>
      </div>
    )
  }

  return (
    <div className="container">
      <div className={styles.pageWrap}>
        <div className="page-header">
          <h1 className="page-title">🤝 Helping</h1>
          <p className="page-subtitle">Booths you're helping with — manage orders from the Orders page</p>
        </div>

        {loading ? (
          <div className={styles.emptyState}><p>Loading...</p></div>
        ) : booths.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🤝</span>
            <p>You're not helping at any booths yet</p>
            <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
              Ask a seller for their booth passcode to start helping
            </p>
          </div>
        ) : (
          <div className={styles.boothList}>
            {booths.map(booth => (
              <div key={booth.id} className={styles.boothCard}>
                <div className={styles.boothCardHeader}>
                  <div className={styles.boothInfo}>
                    <div className={styles.boothIcon}>🏪</div>
                    <div>
                      <h2 className={styles.boothName}>{booth.booth_name}</h2>
                      <span className={styles.boothSeller}>by {booth.seller_name}</span>
                    </div>
                  </div>
                  <span className={`${styles.statusPill} ${booth.booth_is_active ? styles.statusOpen : styles.statusClosed}`}>
                    {booth.booth_is_active ? '● Active' : '● Archived'}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Since</span>
                    <span className={styles.detailValue}>{formatDate(booth.created_at)}</span>
                  </div>
                </div>

                <div className={styles.boothActions}>
                  <Link href="/orders" className={styles.actionBtn}>
                    📦 Orders
                  </Link>
                  <Link href={`/my-stands/${booth.booth_id}`} className={styles.actionBtn}>
                    🛍️ View Booth
                  </Link>

                  {confirmLeaveId === booth.id ? (
                    <div className={styles.confirmLeave}>
                      <span className={styles.confirmText}>Leave "{booth.booth_name}"?</span>
                      <button
                        className={styles.confirmYes}
                        onClick={() => handleLeaveBooth(booth.id, booth.booth_name)}
                        disabled={leavingId === booth.id}
                      >
                        {leavingId === booth.id ? 'Leaving...' : 'Yes, Leave'}
                      </button>
                      <button
                        className={styles.confirmNo}
                        onClick={() => setConfirmLeaveId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.leaveBtn}
                      onClick={() => setConfirmLeaveId(booth.id)}
                    >
                      ✕ Leave Booth
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
