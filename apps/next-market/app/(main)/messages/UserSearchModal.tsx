'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { useErrorToast } from '../../components/ErrorToast'

interface UserSearchModalProps {
  onClose: () => void
}

export function UserSearchModal({ onClose }: UserSearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const { user } = useAuth()
  const router = useRouter()
  const { showError, showInfo } = useErrorToast()

  useEffect(() => {
    if (!user) return

    setLoading(true)
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'
      
      let req = supabase
        .from('profiles')
        .select('id, full_name, avatar_url, communities(name)')
        .neq('id', user.id)
        .neq('id', CASABOT_ID)
        .is('closure_status', null)
        
      if (query.trim()) {
        req = req.ilike('full_name', `%${query.trim()}%`)
      }
      
      const { data, error } = await req.limit(10).order('created_at', { ascending: false })

      if (data) setResults(data)
      setLoading(false)
    }, query.trim() ? 400 : 0) // Immediate fetch for empty, debounce for typing

    return () => clearTimeout(timer)
  }, [query, user])

  const handleStartChat = async (targetUserId: string) => {
    if (!user || creating) return
    setCreating(true)
    const supabase = createClient()

    try {
      // Normalize participant order to avoid duplicate conversations / unique constraint errors
      const [pA, pB] = [user.id, targetUserId].sort()

      // 1. Check if conversation already exists (independent of ordering)
      const { data: existingConvs, error: searchError } = await supabase
        .from('market_conversations')
        .select('id')
        .or(`and(participant_a.eq.${user.id},participant_b.eq.${targetUserId}),and(participant_a.eq.${targetUserId},participant_b.eq.${user.id})`)
        .limit(1)

      const existingConv = existingConvs?.[0]

      if (existingConv?.id) {
        onClose()
        router.push(`/messages/${existingConv.id}`)
        return
      }

      // 2. If no conversation, ensure they haven't explicitly blocked us!
      const { data: blockCheck } = await supabase
        .from('market_blocks')
        .select('id')
        .eq('blocker_id', targetUserId)
        .eq('blocked_id', user.id)
        .maybeSingle()

      if (blockCheck) {
        showError("You cannot initiate a conversation with this user.")
        setCreating(false)
        return
      }

      // 3. Create brand new thread
      const { data: newConv, error: insertError } = await supabase
        .from('market_conversations')
        .insert({
          participant_a: pA,
          participant_b: pB
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      if (newConv?.id) {
        showInfo("Thread created!")
        onClose()
        router.push(`/messages/${newConv.id}`)
      }
    } catch (err: any) {
      console.error(err)
      showError("Failed to create conversation: " + (err.message || 'Unknown error'))
      setCreating(false)
    }
  }

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} 
        onClick={onClose} 
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '90%', maxWidth: 400, background: 'white', borderRadius: 16,
        padding: 24, zIndex: 101, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827' }}>New Message</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <input
          type="text"
          placeholder="Search neighbors by name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 8,
            border: '1px solid #d1d5db', fontSize: '1rem', marginBottom: 16
          }}
        />

        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: 12 }}>Loading neighbors...</p>
          ) : query.trim() && results.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: 12 }}>No neighbors found matching "{query}"</p>
          ) : results.length === 0 ? (
             <p style={{ textAlign: 'center', color: '#6b7280', padding: 12 }}>No neighbors found in your area yet.</p>
          ) : (
            results.map(r => (
              <button
                key={r.id}
                onClick={() => handleStartChat(r.id)}
                disabled={creating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                  background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
                  cursor: creating ? 'not-allowed' : 'pointer', textAlign: 'left',
                  opacity: creating ? 0.5 : 1, transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#e5e7eb', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontWeight: 'bold', color: '#9ca3af' }}>{r.full_name?.charAt(0).toUpperCase() || '?'}</span>
                  )}
                </div>
                <div style={{ flexGrow: 1, color: '#111827', fontWeight: 500 }}>
                  {r.full_name || 'Anonymous Neighbor'}
                  {r.communities?.name && (
                    <span style={{color: '#6b7280', fontSize: '0.85em', fontWeight: 400, marginLeft: 6}}>
                      • {r.communities.name}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
