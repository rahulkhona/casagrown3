'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../lib/supabase'

interface HelperDMModalProps {
  boothName: string
  passcode: string
  userId: string
  onClose: () => void
  onSent: (recipientName: string, conversationId: string) => void
}

export function HelperDMModal({ boothName, passcode, userId, onClose, onSent }: HelperDMModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'

      // Get user's community H3 to show same-community neighbors first
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('home_community_h3_index')
        .eq('id', userId)
        .single()

      const myH3 = myProfile?.home_community_h3_index

      let req = supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .neq('id', userId)
        .neq('id', CASABOT_ID)

      // Filter by same community if available
      if (myH3) {
        req = req.eq('home_community_h3_index', myH3)
      }

      if (query.trim()) {
        req = req.ilike('full_name', `%${query.trim()}%`)
      }

      const { data } = await req.limit(12).order('full_name')
      if (data) setResults(data)
      setLoading(false)
    }, query.trim() ? 400 : 0)

    return () => clearTimeout(timer)
  }, [query, userId])

  const handleInvite = async (targetId: string, targetName: string) => {
    if (sending) return
    setSending(true)
    const supabase = createClient()

    try {
      const joinUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/join-booth/${encodeURIComponent(passcode)}`
        : ''

      const boothLabel = boothName?.trim() ? `my booth "${boothName}"` : 'my CasaGrown booth'

      const inviteMessage = [
        `Hey ${targetName}! 👋`,
        '',
        `I need some help managing my excess produce on CasaGrown and was wondering if you'd be able to help me out?`,
        '',
        `It's pretty straightforward — just keep an eye on orders, hand things off to buyers when they come by, and maybe reply to a message or two.`,
        '',
        `If you can, here's the link to get access to ${boothLabel}:`,
        joinUrl,
        '',
        `Passcode: ${passcode}`,
        '',
        `Let me know! 🌱`,
      ].join('\n')

      // 1. Find or create conversation
      const { data: existing } = await supabase
        .from('market_conversations')
        .select('id')
        .or(`and(participant_a.eq.${userId},participant_b.eq.${targetId}),and(participant_a.eq.${targetId},participant_b.eq.${userId})`)
        .maybeSingle()

      let convId = existing?.id

      if (!convId) {
        // Check block
        const { data: blockCheck } = await supabase
          .from('market_blocks')
          .select('id')
          .eq('blocker_id', targetId)
          .eq('blocked_id', userId)
          .maybeSingle()

        if (blockCheck) {
          setSending(false)
          return
        }

        const { data: newConv, error: insertError } = await supabase
          .from('market_conversations')
          .insert({ participant_a: userId, participant_b: targetId })
          .select('id')
          .single()

        if (insertError) throw insertError
        convId = newConv?.id
      }

      // 2. Send the invite message
      if (convId) {
        const { error: msgError } = await supabase.from('market_chat_messages').insert({
          conversation_id: convId,
          sender_id: userId,
          content: inviteMessage,
        })
        if (msgError) {
          console.warn('Failed to send helper invite message:', msgError)
        }

        // 3. Zero out sender's own unread count (belt-and-suspenders)
        const { data: conv } = await supabase
          .from('market_conversations')
          .select('participant_a')
          .eq('id', convId)
          .single()

        const senderColumn = conv?.participant_a === userId ? 'unread_count_a' : 'unread_count_b'
        await supabase.from('market_conversations')
          .update({ [senderColumn]: 0 })
          .eq('id', convId)

        // Force badge refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('force-badge-update'))
        }
      }

      onSent(targetName, convId)
    } catch (err) {
      console.warn('DM helper invite failed:', err)
      setSending(false)
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
        width: '90%', maxWidth: 420, background: 'white', borderRadius: 16,
        padding: 24, zIndex: 101, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>💬 DM a Helper Invite</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
          Search for someone and we&apos;ll send them a message with your booth invite link and passcode.
        </p>

        <input
          type="text"
          placeholder="Search by name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1px solid #d1d5db', fontSize: '0.95rem', marginBottom: 12,
          }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: 16 }}>Searching...</p>
          ) : results.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280', padding: 16 }}>
              {query.trim() ? `No one found matching "${query}"` : 'No neighbors found in your area yet.'}
            </p>
          ) : (
            results.map(r => (
              <button
                key={r.id}
                onClick={() => handleInvite(r.id, r.full_name || 'Neighbor')}
                disabled={sending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  background: 'none', border: '1px solid #e5e7eb', borderRadius: 10,
                  cursor: sending ? 'not-allowed' : 'pointer', textAlign: 'left',
                  opacity: sending ? 0.5 : 1, transition: 'background 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#f0fdf4'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', backgroundColor: '#e5e7eb',
                  overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontWeight: 'bold', color: '#9ca3af', fontSize: 15 }}>
                      {r.full_name?.charAt(0).toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <div style={{ flexGrow: 1 }}>
                  <div style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>
                    {r.full_name || 'Anonymous Neighbor'}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--green-700)',
                  background: 'var(--green-50)', padding: '4px 10px', borderRadius: 8,
                  flexShrink: 0,
                }}>
                  {sending ? '...' : 'Invite'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
