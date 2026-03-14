'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

export default function FollowingPage() {
  const supabase = createClient()
  const { user } = useAuth()
  const [booths, setBooths] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      // Get all users I follow
      const { data: follows } = await supabase
        .from('followers')
        .select('followed_id, created_at')
        .eq('follower_id', user.id)

      if (!follows || follows.length === 0) { setLoading(false); return }

      const followedIds = follows.map((f: any) => f.followed_id)

      // Get their booths
      const { data: boothData } = await supabase
        .from('market_booths')
        .select('id, owner_id, name, description, decorative_theme')
        .in('owner_id', followedIds)

      if (boothData) {
        // For each booth, get product count
        const enriched = await Promise.all(boothData.map(async (b: any) => {
          const { count } = await supabase
            .from('market_products')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', b.owner_id)
            .eq('is_active', true)
          return { ...b, productCount: count || 0, followedAt: follows.find((f: any) => f.followed_id === b.owner_id)?.created_at }
        }))
        setBooths(enriched)
      }
      setLoading(false)
    }
    load()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnfollow = async (ownerId: string) => {
    await supabase.from('followers').delete().match({ follower_id: user!.id, followed_id: ownerId })
    setBooths(prev => prev.filter(b => b.owner_id !== ownerId))
  }

  if (loading) return <div className="container"><div className="loading-spinner" /></div>

  return (
    <div className="container">
      <h1 className={styles.title}>Following</h1>
      <p className={styles.subtitle}>Booths you follow — you'll be notified when they add new products.</p>

      {booths.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🤍</div>
          <div className="empty-state-title">Not following anyone yet</div>
          <div className="empty-state-text">
            Browse the market and follow booths you like to get notified about new products.
          </div>
          <Link href="/market" className="btn btn-primary" style={{ marginTop: 12 }}>Browse Market</Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {booths.map(b => (
            <div key={b.id} className={styles.card}>
              <Link href={`/market/booth/${b.id}`} className={styles.cardLink}>
                <h3 className={styles.boothName}>{b.name}</h3>
                {b.description && <p className={styles.boothDesc}>{b.description}</p>}
                <span className={styles.productCount}>{b.productCount} active products</span>
              </Link>
              <button className={styles.unfollowBtn} onClick={() => handleUnfollow(b.owner_id)}>
                Unfollow
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
