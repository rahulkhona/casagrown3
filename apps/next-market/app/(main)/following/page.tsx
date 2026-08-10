'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'
import SocialShareModal from '../../components/SocialShareModal'

export default function FollowingPage() {
  const supabase = createClient()
  const { user } = useAuth()
  
  const [following, setFollowing] = useState<any[]>([])
  const [recommended, setRecommended] = useState<any[]>([])
  const [searchResults, setSearchResults] = useState<any[]>([])
  
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const loadData = async () => {
    if (!user) return
    setLoading(true)

    // 1. Get people I follow
    const { data: follows } = await supabase
      .from('market_followers')
      .select('booth_id, created_at')
      .eq('follower_id', user.id)

    if (follows && follows.length > 0) {
      const boothIds = follows.map((f: any) => f.booth_id)
      const { data: boothData } = await supabase
        .from('public_market_booths')
        .select(`
          id, owner_id, name,
          public_profiles!market_booths_owner_id_fkey(full_name, avatar_url)
        `)
        .in('id', boothIds)

      if (boothData) {
        setFollowing(boothData.map((b: any) => ({
          booth_id: b.id,
          owner_id: b.owner_id,
          owner_name: b.public_profiles?.full_name || 'Neighbor',
          avatar_url: b.public_profiles?.avatar_url,
          booth_name: b.name
        })))
      }
    } else {
      setFollowing([])
    }

    // 2. Get recommendations via new RPC
    const { data: recData } = await supabase.rpc('get_recommended_people_to_follow', {
      p_user_id: user.id
    })
    
    if (recData) {
      setRecommended(recData)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search using native timeouts
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  useEffect(() => {
    if (query.trim().length === 0) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_people_to_follow', {
        p_query: query.trim(),
        p_user_id: user!.id
      })
      if (data) setSearchResults(data)
      setIsSearching(false)
    }, 300)

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnfollow = async (boothId: string) => {
    await supabase.from('market_followers').delete().match({ follower_id: user!.id, booth_id: boothId })
    setFollowing(prev => prev.filter(b => b.booth_id !== boothId))
    loadData() // Re-fetch because they might pop back into recommended
  }

  const handleFollow = async (boothId: string) => {
    await supabase.from('market_followers').insert({ follower_id: user!.id, booth_id: boothId })
    loadData() // Re-fetch everything
  }

  if (loading && following.length === 0 && recommended.length === 0) {
    return <div className="container"><div className="loading-spinner" /></div>
  }

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 4 }}>Community</h1>
          <p className={styles.subtitle} style={{ margin: 0 }}>Connect with neighbors and local sellers.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsShareModalOpen(true)}>
          Invite Friends
        </button>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <input 
          type="text" 
          placeholder="Search neighbors by name or email..." 
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: '8px', 
            border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none'
          }}
        />
      </div>

      {query.trim().length > 0 ? (
        // SEARCH RESULTS
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Search Results</h2>
          {isSearching ? <div className="loading-spinner" /> : (
            searchResults.length === 0 ? (
              <p>No neighbors found for "{query}".</p>
            ) : (
              <div className={styles.grid}>
                {searchResults.map(b => (
                  <PersonCard key={b.booth_id} person={b} action="follow" onClick={() => handleFollow(b.booth_id)} />
                ))}
              </div>
            )
          )}
        </div>
      ) : (
        // DEFAULT VIEW
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          
          {recommended.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, marginBottom: 16 }}>Recommended for you</h2>
              <div className={styles.grid}>
                {recommended.map(b => (
                  <PersonCard key={b.booth_id} person={b} action="follow" onClick={() => handleFollow(b.booth_id)} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>People You Follow</h2>
            {following.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 0 }}>
                <div className="empty-state-icon">🤍</div>
                <div className="empty-state-title">Not following anyone yet</div>
                <div className="empty-state-text">
                  Follow neighbors to stay updated on their backyard produce!
                </div>
              </div>
            ) : (
              <div className={styles.grid}>
                {following.map(b => (
                  <PersonCard key={b.booth_id} person={b} action="unfollow" onClick={() => handleUnfollow(b.booth_id)} />
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {isShareModalOpen && user && (
        <SocialShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          shareUrl={`https://casagrown.com/invite/${user?.id}`}
          title="Join me on CasaGrown!"
          entityName="CasaGrown"
          shareMessage="Check out this local neighborhood platform for sharing and buying backyard produce."
          shareContext="following_invite"
          userId={user?.id}
        />
      )}
    </div>
  )
}

function PersonCard({ person, action, onClick }: { person: any, action: 'follow' | 'unfollow', onClick: () => void }) {
  const isFollow = action === 'follow'
  return (
    <div className={styles.card} style={{ flexDirection: 'row', alignItems: 'center', gap: '16px', padding: '16px' }}>
      <Link href={`/market/booth/${person.booth_id}`} style={{ flexShrink: 0 }}>
        {person.avatar_url ? (
          <img src={person.avatar_url} alt={person.owner_name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#64748b', fontWeight: 600 }}>
            {person.owner_name?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
      </Link>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/market/booth/${person.booth_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {person.owner_name}
          </h3>
          {person.reason ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#166534', fontWeight: 500 }}>✨ {person.reason}</p>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Host of {person.booth_name || person.name || 'a local stand'}
            </p>
          )}
        </Link>
      </div>

      <button 
        onClick={onClick}
        style={{
          padding: '6px 16px',
          borderRadius: '20px',
          border: isFollow ? 'none' : '1px solid #cbd5e1',
          background: isFollow ? '#166534' : 'transparent',
          color: isFollow ? '#ffffff' : '#475569',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.2s',
          fontSize: '13px'
        }}
      >
        {isFollow ? 'Follow' : 'Unfollow'}
      </button>
    </div>
  )
}
