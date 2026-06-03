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
  owner_name?: string
  owner_id?: string
}

export default function MyStandsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  const [stands, setStands] = useState<StandRow[]>([])
  const [helperStands, setHelperStands] = useState<StandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [shareStand, setShareStand] = useState<StandRow | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<StandRow | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { showSuccess } = useErrorToast()

  // N-Tier states
  const [maxBooths, setMaxBooths] = useState(1)
  const [activePlan, setActivePlan] = useState<'lite' | 'pro' | 'elite'>('lite')
  const isPro = activePlan !== 'lite'

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/my-stands')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch stands and active plan limits
  useEffect(() => {
    if (authLoading || !user) return
    const load = async () => {
      // 1. Fetch Plan Details
      const { data: subData } = await supabase
        .from('seller_subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .maybeSingle()

      const planName = subData?.plan === 'free' || !subData?.plan ? 'lite' : (subData.plan as 'lite' | 'pro' | 'elite')

      // Check if user is a pro tester — treat as 'elite'
      const { data: testerRow } = await supabase
        .from('pro_testers')
        .select('email')
        .eq('email', user.email)
        .maybeSingle()
      const effectivePlan = testerRow ? 'elite' : planName
      setActivePlan(effectivePlan)

      // 2. Fetch Tier Limits
      const { data: tierData } = await supabase
        .from('subscription_tiers')
        .select('max_booths')
        .eq('tier_name', effectivePlan)
        .maybeSingle()

      setMaxBooths(tierData?.max_booths ?? 1)

      // 3. Fetch active booths
      const { data: booths } = await supabase
        .from('market_booths')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (booths && booths.length > 0) {
        // Fetch product counts for each stand
        const boothIds = booths.map((b: any) => b.id)
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
      } else {
        setStands([])
      }

      // 4. Fetch helper booths
      const { data: helperRelations } = await supabase
        .from('booth_helpers')
        .select('booth_id')
        .eq('helper_id', user.id)
        .eq('status', 'accepted')

      if (helperRelations && helperRelations.length > 0) {
        const helperBoothIds = helperRelations.map((r: any) => r.booth_id)
        const { data: hBooths } = await supabase
          .from('market_booths')
          .select('*')
          .in('id', helperBoothIds)

        if (hBooths && hBooths.length > 0) {
          const hBoothIds = hBooths.map((b: any) => b.id)
          const { data: hProducts } = await supabase
            .from('market_products')
            .select('booth_id')
            .in('booth_id', hBoothIds)
            .eq('is_deleted', false)

          const hCountMap: Record<string, number> = {}
          if (hProducts) {
            hProducts.forEach((p: any) => {
              hCountMap[p.booth_id] = (hCountMap[p.booth_id] || 0) + 1
            })
          }

          const ownerIds = hBooths.map((b: any) => b.owner_id)
          const { data: hOwners } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', ownerIds)

          const ownerMap: Record<string, string> = {}
          if (hOwners) {
            hOwners.forEach((o: any) => {
              ownerMap[o.id] = o.full_name || 'Seller'
            })
          }

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
              owner_name: ownerMap[b.owner_id] || 'Seller',
              owner_id: b.owner_id,
            }))
          )
        } else {
          setHelperStands([])
        }
      } else {
        setHelperStands([])
      }
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

  // 0 stands and helper stands — empty state
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

  // 1+ stands (owned or helped) — show grid
  const totalStandsSearch = stands.length + helperStands.length

  return (
    <>
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Booths</h1>
        <p className={styles.subtitle}>
          Manage your booths and listings{activePlan !== 'lite' ? ` (${stands.length} ${maxBooths < 0 ? 'active' : `/ ${maxBooths} active`})` : ''}
        </p>
      </div>

      {/* Action Row — Gated dynamically by booth limits */}
      <div style={{ marginBottom: 24 }}>
        <div className={styles.actionRow}>
          {activePlan !== 'lite' && (
            <Link href="/my-stands/catalog" className={styles.actionBtnOutline}>
              📦 Manage Product Catalog
            </Link>
          )}

          {(maxBooths < 0 || stands.length < maxBooths) && (
            <Link href="/my-stands/new" className={styles.actionBtnPrimary}>
              + Add New Booth
            </Link>
          )}
        </div>

        {activePlan !== 'lite' && maxBooths >= 0 && stands.length >= maxBooths && (
          <div style={{ margin: '12px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>
              You have reached the booth limit of <strong>{maxBooths}</strong> for your plan tier.
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      {totalStandsSearch > 3 && (
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

      {stands.length > 0 && (
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
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/marketplace-csv?boothId=${stand.id}`, {
                          headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
                        })
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({ error: 'Download failed' }))
                          alert(err.error || 'Download failed')
                          return
                        }
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `marketplace-listings-${stand.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.csv`
                        a.click()
                        URL.revokeObjectURL(url)
                        showSuccess('Marketplace spreadsheet downloaded!')
                      } catch {
                        alert('Failed to download spreadsheet')
                      }
                    }}
                  >
                    📥 Marketplace CSV
                  </button>
                )}
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
      )}

      {helperStands.length > 0 && (
        <div style={{ marginTop: 48 }}>
          <h2 className={styles.title} style={{ fontSize: 20, marginBottom: 4 }}>Booths I Help With</h2>
          <p className={styles.subtitle} style={{ marginBottom: 16 }}>You have been added as an assistant for these booths</p>
          <div className={styles.standsGrid}>
            {helperStands
              .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(stand => (
              <div key={stand.id} className={styles.standCard} style={!stand.is_active ? { opacity: 0.6, filter: 'grayscale(0.4)' } : undefined}>
                {/* Banner */}
                <div className={styles.cardBanner}>
                  {stand.header_image_url ? (
                    <img src={stand.header_image_url} alt={stand.name} />
                  ) : null}
                  <span className={`${styles.statusBadge} ${styles.statusHelper}`}>
                    ● Helper
                  </span>
                </div>

                {/* Body */}
                <div className={styles.cardBody}>
                  <h3 className={styles.standName}>{stand.name}</h3>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: '-4px 0 8px' }}>
                    by {stand.owner_name}
                  </p>
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
                  <button
                    className={`${styles.cardActionBtn} ${styles.cardActionSecondary}`}
                    onClick={() => setShareStand(stand)}
                  >
                    🔗 Share
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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



      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </>
  )
}
