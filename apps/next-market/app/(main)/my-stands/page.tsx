'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { StandIcon } from '../../components/icons'
import SocialShareModal from '../../components/SocialShareModal'

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
  const [helperStands, setHelperStands] = useState<(StandRow & { owner_name: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [shareStand, setShareStand] = useState<StandRow | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<StandRow | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [leaveTarget, setLeaveTarget] = useState<(StandRow & { owner_name: string }) | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

    // Fetch booths user helps at
    const loadHelperBooths = async () => {
      const { data: helpers } = await supabase
        .from('booth_helpers')
        .select('booth_id, role')
        .eq('helper_id', user.id)
        .eq('status', 'accepted')

      if (!helpers || helpers.length === 0) return

      const helperBoothIds = helpers.map(h => h.booth_id)
      const { data: hBooths } = await supabase
        .from('market_booths')
        .select('*')
        .in('id', helperBoothIds)

      if (!hBooths || hBooths.length === 0) return

      const ownerIds = Array.from(new Set(hBooths.map(b => b.owner_id)))
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ownerIds)
      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || [])

      const { data: hProducts } = await supabase
        .from('market_products')
        .select('booth_id')
        .in('booth_id', helperBoothIds)
        .eq('is_deleted', false)
      const hCountMap: Record<string, number> = {}
      if (hProducts) hProducts.forEach((p: any) => { hCountMap[p.booth_id] = (hCountMap[p.booth_id] || 0) + 1 })

      setHelperStands(
        hBooths.map((b: any) => ({
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
          product_count: hCountMap[b.id] || 0,
          owner_name: profileMap.get(b.owner_id) || 'Seller',
        }))
      )
    }

    // Wait for both fetches before showing the page
    Promise.all([load(), loadHelperBooths()]).then(() => setLoading(false))
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

  const handleLeaveBooth = async () => {
    if (!leaveTarget || !user) return
    setLeaving(true)
    await supabase
      .from('booth_helpers')
      .update({ status: 'left', updated_at: new Date().toISOString() })
      .eq('booth_id', leaveTarget.id)
      .eq('helper_id', user.id)
    setHelperStands(prev => prev.filter(s => s.id !== leaveTarget.id))
    setLeaveTarget(null)
    setLeaving(false)
  }
  if (loading) {
    return <LoadingSpinner message="Loading your booths..." />
  }

  // 0 stands — empty state
  if (stands.length === 0 && helperStands.length === 0) {
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

      {/* Action Row — above booth cards (Pro only) */}
      {isPro && (
        <div className={styles.actionRow}>
          <Link href="/my-stands/catalog" className={styles.actionBtnOutline}>
            📦 Manage Product Catalog
          </Link>
          <Link href="/my-stands/new" className={styles.actionBtnPrimary}>
            + Add New Booth
          </Link>
        </div>
      )}

      {/* Search */}
      {(stands.length + helperStands.length) > 3 && (
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

      {/* Helper Stands */}
      {helperStands.length > 0 && (
        <>
          <div className={styles.header} style={{ marginTop: 32 }}>
            <h2 className={styles.title} style={{ fontSize: 20 }}>🤝 Booths I Help With</h2>
            <p className={styles.subtitle}>You can add listings to these booths</p>
          </div>
          <div className={styles.standsGrid}>
            {helperStands
              .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.owner_name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(stand => (
              <div key={stand.id} className={styles.standCard}>
                <div className={styles.cardBanner}>
                  {stand.header_image_url ? (
                    <img src={stand.header_image_url} alt={stand.name} />
                  ) : null}
                  <span className={`${styles.statusBadge} ${styles.statusHelper}`}>
                    🤝 Helping
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.standName}>{stand.name}</h3>
                  <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 6 }}>
                    by {stand.owner_name}
                  </div>
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
                  <button
                    className={`${styles.cardActionBtn} ${styles.cardActionDanger}`}
                    onClick={() => setLeaveTarget(stand)}
                  >
                    🚪 Leave
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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

      {/* Leave Booth Confirmation Modal */}
      {leaveTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }} onClick={() => !leaving && setLeaveTarget(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '90%', maxWidth: 420, background: '#fff', borderRadius: 24,
            padding: '32px 24px', textAlign: 'center',
            animation: 'slideUp 0.25s ease',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚪</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Leave "{leaveTarget.name}"?
            </h3>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
              You will no longer be able to add listings or manage orders for this booth.
              The booth owner can re-invite you later.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setLeaveTarget(null)}
                disabled={leaving}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e7eb',
                  background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveBooth}
                disabled={leaving}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                  background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: leaving ? 'not-allowed' : 'pointer',
                  opacity: leaving ? 0.7 : 1,
                }}
              >
                {leaving ? 'Leaving...' : 'Leave Booth'}
              </button>
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
