'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { StandIcon } from '../../components/icons'
import SocialShareModal from '../../components/SocialShareModal'
import { useProEnabled } from '../../../lib/useProEnabled'
import { useErrorToast } from '../../components/ErrorToast'

import styles from './page.module.css'

interface StandRow {
  id: string
  name: string
  header_image_url: string | null
  is_active: boolean
  offers_pickup: boolean
  offers_delivery: boolean
  delivery_radius_miles: number | null
  pickup_address: string | null
  delivery_zipcodes: string[] | null
  created_at: string
  product_count?: number
}

export default function MyStandsPage() {
  const { user, loading: authLoading, isAuthenticated, isPro } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  const [stands, setStands] = useState<StandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [shareStand, setShareStand] = useState<StandRow | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<StandRow | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [proInterestSent, setProInterestSent] = useState(false)
  const [proInterestSending, setProInterestSending] = useState(false)
  const { showSuccess } = useErrorToast()
  const proEnabled = useProEnabled()

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/my-stands')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch stands
  useEffect(() => {
    if (authLoading || !user) return
    const load = async () => {
      const { data: booths } = await supabase
        .from('market_booths')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (!booths || booths.length === 0) {
        setStands([])
        setLoading(false)
        return
      }

      // Fetch product counts for each stand
      const boothIds = booths.map(b => b.id)
      const { data: products } = await supabase
        .from('market_products')
        .select('booth_id')
        .in('booth_id', boothIds)
        .eq('is_deleted', false)

      const countMap: Record<string, number> = {}
      if (products) {
        products.forEach((p: any) => {
          countMap[p.booth_id] = (countMap[p.booth_id] || 0) + 1
        })
      }

      setStands(
        booths.map((b: any) => ({
          id: b.id,
          name: b.name || 'Unnamed Booth',
          header_image_url: b.header_image_url,
          is_active: b.is_open !== false,
          offers_pickup: b.offers_pickup ?? false,
          offers_delivery: b.offers_delivery ?? false,
          delivery_radius_miles: b.delivery_radius_miles,
          pickup_address: b.pickup_address,
          delivery_zipcodes: b.delivery_zipcodes,
          created_at: b.created_at,
          product_count: countMap[b.id] || 0,
        }))
      )
    }

    load().then(() => setLoading(false))
  }, [user?.id, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !isAuthenticated) {
    return <LoadingSpinner />
  }

  const handleToggleActive = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    const newActive = !archiveTarget.is_active
    const { error } = await supabase
      .from('market_booths')
      .update({ is_open: newActive })
      .eq('id', archiveTarget.id)
    setArchiving(false)
    if (!error) {
      setStands(prev => prev.map(s => s.id === archiveTarget.id ? { ...s, is_active: newActive } : s))
    }
    setArchiveTarget(null)
  }

  if (loading) {
    return <LoadingSpinner message="Loading your booths..." />
  }

  // 0 stands — empty state
  if (stands.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <StandIcon size={64} color="var(--green-600)" />
          </div>
          <h2 className={styles.emptyTitle}>Create Your First Booth</h2>
          <p className={styles.emptyText}>
            Set up a booth to start selling your fresh, homegrown goods
            to neighbors in your area.
          </p>
          <Link href="/my-stands/new" className={styles.ctaBtn}>
            🌱 Create My Booth
          </Link>
        </div>
      </div>
    )
  }

  // 2+ stands — show grid
  return (
    <>
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Booths</h1>
        <p className={styles.subtitle}>
          Manage your booths and listings
        </p>
      </div>

      {/* Action Row — Pro gets active buttons, free gets greyed + upgrade pitch */}
      {isPro ? (
        <div className={styles.actionRow}>
          <Link href="/my-stands/catalog" className={styles.actionBtnOutline}>
            📦 Manage Product Catalog
          </Link>
          <Link href="/my-stands/new" className={styles.actionBtnPrimary}>
            + Add New Booth
          </Link>
        </div>
      ) : proEnabled ? (
        <div style={{ marginBottom: 24 }}>
          {/* Greyed-out Pro buttons */}
          <div className={styles.actionRow}>
            <button className={styles.actionBtnOutline} disabled style={{
              opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none',
              filter: 'grayscale(0.5)',
            }}>
              📦 Manage Product Catalog 🔒
            </button>
            <button className={styles.actionBtnPrimary} disabled style={{
              opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none',
              filter: 'grayscale(0.5)',
            }}>
              + Add New Booth 🔒
            </button>
          </div>
          <div style={{ margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
              🔒 Pro lets you create a booth for each farmers market or route — each with its own schedule, pickup location, and inventory.
            </p>
            <div style={{ marginTop: 6 }}>
              <Link href="/pro-manage" style={{ fontSize: 12, color: 'var(--green-700)', fontWeight: 600, textDecoration: 'underline' }}>
                Send me details about CasaGrown Pro features →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Search */}
      {stands.length > 3 && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="🔍 Search booths..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--gray-200)', fontSize: 14,
              background: 'var(--gray-50)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <div className={styles.standsGrid}>
        {stands
          .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(stand => (
          <div key={stand.id} className={styles.standCard} style={!stand.is_active ? { opacity: 0.6, filter: 'grayscale(0.4)' } : undefined}>
            {/* Banner */}
            <div className={styles.cardBanner}>
              {stand.header_image_url ? (
                <img src={stand.header_image_url} alt={stand.name} />
              ) : null}
              <span className={`${styles.statusBadge} ${stand.is_active ? styles.statusActive : styles.statusInactive}`}>
                {stand.is_active ? '● Active' : '● Inactive'}
              </span>
            </div>

            {/* Body */}
            <div className={styles.cardBody}>
              <h3 className={styles.standName}>{stand.name}</h3>
              <div className={styles.cardMeta}>
                <span className={styles.metaChip}>
                  📦 {stand.product_count || 0} products
                </span>
                {stand.offers_pickup && (
                  <span className={styles.metaChip}>📍 Pickup</span>
                )}
                {stand.offers_delivery && (
                  <span className={styles.metaChip}>
                    🚗 Delivery{stand.delivery_radius_miles ? ` (${stand.delivery_radius_miles}mi)` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className={styles.cardActions}>
              <Link
                href={`/my-booth/products/new?booth=${stand.id}`}
                className={`${styles.cardActionBtn} ${styles.cardActionPrimary}`}
              >
                ➕ Add Listing
              </Link>
              <Link
                href={`/my-stands/${stand.id}`}
                className={`${styles.cardActionBtn} ${styles.cardActionSecondary}`}
              >
                👁️ View
              </Link>
              <Link
                href={`/my-stands/${stand.id}?edit=true`}
                className={`${styles.cardActionBtn} ${styles.cardActionSecondary}`}
              >
                ✏️ Edit
              </Link>
              <button
                className={`${styles.cardActionBtn} ${styles.cardActionSecondary}`}
                onClick={() => setShareStand(stand)}
              >
                🔗 Share
              </button>
              {isPro && (
                <button
                  className={`${styles.cardActionBtn} ${styles.cardActionSecondary}`}
                  onClick={() => setArchiveTarget(stand)}
                  style={stand.is_active ? { color: '#b45309' } : { color: 'var(--green-700)' }}
                >
                  {stand.is_active ? '📦 Archive' : '🔄 Reactivate'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>


    </div>

      {/* Social Share Modal */}
      {shareStand && (
        <SocialShareModal
          isOpen={!!shareStand}
          onClose={() => setShareStand(null)}
          title={`Share ${shareStand.name}`}
          subtitle="Invite friends and family to visit your produce stand."
          entityName={shareStand.name}
          shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${shareStand.id}` : ''}
          shareMessage={`Hey! 🌱 Check out my produce stand "${shareStand.name}" on CasaGrown Market!\n\nFresh produce straight from my backyard.\n\n👇 Click the link below to browse and shop:\n${typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${shareStand.id}` : ''}\n\nFresh. Local. Trusted.`}
          shareContext="booth_invitation"
          userId={user?.id}
          platforms={['whatsapp', 'nextdoor', 'facebook', 'sms', 'email', 'copy']}
        />
      )}

      {/* Archive / Reactivate Confirmation Modal */}
      {archiveTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }} onClick={() => !archiving && setArchiveTarget(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '90%', maxWidth: 420, background: '#fff', borderRadius: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <div style={{ padding: '28px 24px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {archiveTarget.is_active ? '📦' : '🔄'}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                {archiveTarget.is_active
                  ? `Archive "${archiveTarget.name}"?`
                  : `Reactivate "${archiveTarget.name}"?`}
              </h3>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
                {archiveTarget.is_active
                  ? 'This booth and its listings will be hidden from the market. You can reactivate it anytime.'
                  : 'This booth and its listings will become visible on the market again.'}
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setArchiveTarget(null)}
                  disabled={archiving}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e7eb',
                    background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleToggleActive}
                  disabled={archiving}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                    background: archiveTarget.is_active ? '#b45309' : 'var(--green-600)',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: archiving ? 'not-allowed' : 'pointer',
                    opacity: archiving ? 0.7 : 1,
                  }}
                >
                  {archiving
                    ? (archiveTarget.is_active ? 'Archiving...' : 'Reactivating...')
                    : (archiveTarget.is_active ? 'Archive' : 'Reactivate')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </>
  )
}
