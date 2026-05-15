'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase'

interface ShareData {
  id: string
  question: string
  bot_response: string
  conversation_context: { role: string; text: string }[]
  actions: any[]
  created_at: string
}

interface VoteCounts { accurate: number; partial: number; inaccurate: number }
interface VoteDetail { rating: string; voter_name: string | null; voter_key: string }
interface Suggestion { id: string; suggestion_text: string; upvotes: number; voter_name: string | null }

const GROWBOT_AVATAR = '/growbot-avatar-v3.png'

function renderInline(text: string) {
  // Process bold, italic, and inline code
  const parts: (string | JSX.Element)[] = []
  let key = 0
  const inlineRegex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`)/g
  let lastIndex = 0
  let match
  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[2] !== undefined) parts.push(<strong key={key++}>{match[2]}</strong>)
    else if (match[3] !== undefined) parts.push(<em key={key++}>{match[3]}</em>)
    else if (match[4] !== undefined) parts.push(<code key={key++} style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 4, fontSize: '0.9em' }}>{match[4]}</code>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length ? parts : [text]
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return <br key={i} />
    // Headings
    if (trimmed.startsWith('### '))
      return <p key={i} style={{ margin: '8px 0 4px', fontWeight: 700, fontSize: '0.95em' }}>{renderInline(trimmed.slice(4))}</p>
    if (trimmed.startsWith('## '))
      return <p key={i} style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: '1em' }}>{renderInline(trimmed.slice(3))}</p>
    // Bullets
    if (trimmed.startsWith('* ') || trimmed.startsWith('- '))
      return <li key={i} style={{ marginBottom: 2, marginLeft: 16 }}>{renderInline(trimmed.slice(2))}</li>
    return <p key={i} style={{ margin: '3px 0' }}>{renderInline(trimmed)}</p>
  })
}

export default function GrowBotSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)

  // Check auth state directly (this page is outside the (main) layout)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser({ id: data.session.user.id, email: data.session.user.email ?? undefined })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUser({ id: session.user.id, email: session.user.email ?? undefined })
      else setUser(null)
    })
    return () => subscription.unsubscribe()
  }, [])
  const [share, setShare] = useState<ShareData | null>(null)
  const [votes, setVotes] = useState<VoteCounts>({ accurate: 0, partial: 0, inaccurate: 0 })
  const [voteDetails, setVoteDetails] = useState<VoteDetail[]>([])
  const [myVote, setMyVote] = useState<string | null>(null)
  const [selectedVote, setSelectedVote] = useState<'accurate' | 'partial' | 'inaccurate' | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [newSuggestion, setNewSuggestion] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [suggestionPosted, setSuggestionPosted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set())

  // Auth form for guest voters
  const [authForm, setAuthForm] = useState<{
    name: string; email: string; otp: string;
    step: 'idle' | 'capture' | 'otp' | 'done';
    pendingRating: 'accurate' | 'partial' | 'inaccurate' | null;
    loading: boolean; error: string;
  }>({ name: '', email: '', otp: '', step: 'idle', pendingRating: null, loading: false, error: '' })

  // Load upvote tracking
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('growbot_upvoted') || '[]')
      setUpvotedIds(new Set(stored))
    } catch {}
  }, [])

  // Load share data, votes, suggestions
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('growbot_shared_responses').select('*').eq('id', id).single()
      if (!data) { setNotFound(true); setLoading(false); return }
      setShare(data)

      // Fetch vote details (with names)
      const { data: voteData } = await supabase
        .from('growbot_response_votes')
        .select('rating, voter_name, voter_key')
        .eq('response_id', id)
      if (voteData) {
        setVoteDetails(voteData)
        const c = { accurate: 0, partial: 0, inaccurate: 0 }
        voteData.forEach(v => { c[v.rating as keyof typeof c]++ })
        setVotes(c)
      }

      const { data: sugData } = await supabase
        .from('growbot_response_suggestions')
        .select('id, suggestion_text, upvotes, voter_name')
        .eq('response_id', id)
        .order('upvotes', { ascending: false })
      if (sugData) setSuggestions(sugData)
      setLoading(false)
    }
    load()
  }, [id])

  // Check if current user already voted
  useEffect(() => {
    if (!user || voteDetails.length === 0) return
    const existing = voteDetails.find(v => v.voter_key === user.id)
    if (existing) setMyVote(existing.rating)
  }, [user, voteDetails])

  // ── Vote handler (two-step: select → confirm) ──
  const handleVote = (rating: 'accurate' | 'partial' | 'inaccurate') => {
    if (myVote) return
    if (!user) {
      setAuthForm(p => ({ ...p, step: 'capture', pendingRating: rating }))
      return
    }
    // Toggle selection — click again to deselect
    setSelectedVote(prev => prev === rating ? null : rating)
  }

  const confirmVote = async () => {
    if (!selectedVote || !user || myVote) return
    await submitVote(selectedVote, user.id, user.email?.split('@')[0] || 'Anonymous')
    setSelectedVote(null)
  }

  const submitVote = async (rating: string, odKey: string, voterName: string) => {
    const supabase = createClient()
    // Try with voter_name first, fall back without if column doesn't exist yet
    let result = await supabase.from('growbot_response_votes').insert({
      response_id: id, voter_key: odKey, rating, voter_name: voterName,
    })
    if (result.error && result.error.message?.includes('voter_name')) {
      result = await supabase.from('growbot_response_votes').insert({
        response_id: id, voter_key: odKey, rating,
      })
    }
    if (result.error) {
      console.error('[GrowBot] Vote failed:', result.error)
      return
    }
    setMyVote(rating)
    setVotes(prev => ({ ...prev, [rating]: prev[rating as keyof typeof prev] + 1 }))
    setVoteDetails(prev => [...prev, { rating, voter_name: voterName, voter_key: odKey }])
  }

  // ── Auth flow for guest voters ──
  const handleAuthSend = async () => {
    if (!authForm.name.trim()) { setAuthForm(p => ({ ...p, error: 'Please enter your name.' })); return }
    if (!authForm.email.trim()) { setAuthForm(p => ({ ...p, error: 'Please enter your email.' })); return }
    setAuthForm(p => ({ ...p, loading: true, error: '' }))
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: authForm.email.toLowerCase().trim(),
      options: { data: { full_name: authForm.name.trim() }, shouldCreateUser: true },
    })
    setAuthForm(p => error
      ? { ...p, loading: false, error: error.message }
      : { ...p, loading: false, step: 'otp' }
    )
  }

  const handleAuthVerify = async () => {
    if (authForm.otp.length < 6) return
    setAuthForm(p => ({ ...p, loading: true, error: '' }))
    const supabase = createClient()
    const { data: vData, error } = await supabase.auth.verifyOtp({
      email: authForm.email.toLowerCase().trim(),
      token: authForm.otp, type: 'email',
    })
    if (error) { setAuthForm(p => ({ ...p, loading: false, error: error.message })); return }
    if (!vData.user) return
    // Set user immediately so buttons enable right away
    setUser({ id: vData.user.id, email: vData.user.email ?? undefined })
    // Submit the pending vote if they clicked a vote button before auth
    if (authForm.pendingRating) {
      await submitVote(authForm.pendingRating, vData.user.id, authForm.name.trim())
    }
    setAuthForm(p => ({ ...p, loading: false, step: 'done' }))
  }

  // ── Suggest handler ──
  const handleSuggest = async () => {
    if (!newSuggestion.trim() || submitting) return
    if (!user) {
      setAuthForm(p => ({ ...p, step: 'capture', pendingRating: null }))
      return
    }
    setSubmitting(true)
    const supabase = createClient()
    const voterName = user.email?.split('@')[0] || 'Anonymous'
    let result = await supabase.from('growbot_response_suggestions').insert({
      response_id: id, voter_key: user.id, suggestion_text: newSuggestion.trim(), voter_name: voterName,
    }).select('id, suggestion_text, upvotes, voter_name').single()
    // Fallback without voter_name if column doesn't exist
    if (result.error && result.error.message?.includes('voter_name')) {
      result = await supabase.from('growbot_response_suggestions').insert({
        response_id: id, voter_key: user.id, suggestion_text: newSuggestion.trim(),
      }).select('id, suggestion_text, upvotes').single() as any
    }
    if (result.error) {
      console.error('[GrowBot] Suggestion failed:', result.error)
    } else if (result.data) {
      setSuggestions(prev => [result.data, ...prev])
      setNewSuggestion('')
      setSuggestionPosted(true)
    }
    setSubmitting(false)
  }

  const handleUpvote = async (sug: Suggestion) => {
    if (upvotedIds.has(sug.id)) return
    const supabase = createClient()
    await supabase.from('growbot_response_suggestions').update({ upvotes: sug.upvotes + 1 }).eq('id', sug.id)
    setSuggestions(prev => prev.map(s => s.id === sug.id ? { ...s, upvotes: s.upvotes + 1 } : s))
    const next = new Set(upvotedIds).add(sug.id)
    setUpvotedIds(next)
    localStorage.setItem('growbot_upvoted', JSON.stringify(Array.from(next)))
  }

  const totalVotes = votes.accurate + votes.partial + votes.inaccurate

    const voteStyle = (rating: string) => ({
    flex: 1, padding: '10px 6px', borderRadius: 12, border: `2px solid ${
      rating === 'accurate' ? '#22c55e' : rating === 'partial' ? '#f59e0b' : '#ef4444'}`,
    background: myVote === rating ? (
      rating === 'accurate' ? '#dcfce7' : rating === 'partial' ? '#fef3c7' : '#fee2e2'
    ) : selectedVote === rating ? (
      rating === 'accurate' ? '#bbf7d0' : rating === 'partial' ? '#fde68a' : '#fecaca'
    ) : myVote ? '#f9fafb' : 'white',
    color: rating === 'accurate' ? '#166534' : rating === 'partial' ? '#92400e' : '#991b1b',
    cursor: myVote ? 'default' : 'pointer', fontWeight: 600, fontSize: 13,
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2,
    opacity: myVote && myVote !== rating ? 0.5 : 1, transition: 'all 0.15s',
    transform: selectedVote === rating && !myVote ? 'scale(1.05)' : 'scale(1)',
  })

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4' }}>
      <div style={{ color: '#166534', fontSize: 16 }}>Loading poll…</div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', gap: 16 }}>
      <div style={{ fontSize: 40 }}>🌱</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Poll not found</div>
      <Link href="/growbot" style={{ color: '#166534', textDecoration: 'none', fontWeight: 600 }}>Try GrowBot →</Link>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 40%)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          <img src={GROWBOT_AVATAR} alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>GrowBot Community Poll</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>by CasaGrown</div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          style={{ fontSize: 12, background: copied ? '#dcfce7' : 'none', border: '1px solid #e5e7eb', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', color: copied ? '#166534' : '#6b7280', transition: 'all 0.2s' }}
        >{copied ? '✓ Copied!' : '🔗 Share'}</button>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Prior conversation context (collapsible) */}
        {share!.conversation_context && share!.conversation_context.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowContext(p => !p)}
              style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {showContext ? '▼' : '▶'} View full conversation context ({share!.conversation_context.length} prior messages)
            </button>
            {showContext && (
              <div style={{ marginTop: 8, borderLeft: '3px solid #bbf7d0', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {share!.conversation_context.map((m, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: m.role === 'user' ? '#1d4ed8' : '#166534' }}>
                      {m.role === 'user' ? 'You' : 'GrowBot'}:
                    </span>{' '}
                    <span style={{ color: '#374151' }}>{m.text.slice(0, 200)}{m.text.length > 200 ? '…' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Question */}
        <div style={{ background: '#1e3a2f', color: 'white', borderRadius: '16px 16px 4px 16px', padding: '14px 16px', marginBottom: 12, fontSize: 15, lineHeight: 1.5 }}>
          {share!.question}
        </div>

        {/* GrowBot Answer */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            <img src={GROWBOT_AVATAR} alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
          </div>
          <div style={{ background: 'white', borderRadius: '16px 16px 16px 4px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', fontSize: 14, lineHeight: 1.6, color: '#111827', flex: 1 }}>
            {renderMarkdown(share!.bot_response)}
          </div>
        </div>

        {/* Guest auth: always visible for unauthenticated users */}
        {!user && authForm.step !== 'done' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            {authForm.step === 'otp' ? (
              <>
                <div style={{ fontWeight: 600, color: '#166534', fontSize: 13, marginBottom: 6 }}>✉️ Check your email for a code</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Sent to <strong>{authForm.email}</strong></div>
                {authForm.error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>{authForm.error}</div>}
                <input
                  type="text" inputMode="numeric" maxLength={6} placeholder="6-digit code"
                  value={authForm.otp}
                  onChange={e => setAuthForm(p => ({ ...p, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                />
                <button onClick={handleAuthVerify} disabled={authForm.loading || authForm.otp.length < 6}
                  style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 10, background: authForm.otp.length < 6 ? '#9ca3af' : '#166534', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >{authForm.loading ? 'Verifying…' : 'Verify & Vote →'}</button>
                <button onClick={() => setAuthForm(p => ({ ...p, step: 'idle', otp: '' }))} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', marginTop: 6, textDecoration: 'underline' }}>
                  Use a different email
                </button>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, color: '#166534', fontSize: 14, marginBottom: 4 }}>🗳️ Enter your details to vote</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.5 }}>Your name and email are required to vote and suggest.</div>
                {authForm.error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>{authForm.error}</div>}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input type="text" placeholder="Your name" value={authForm.name}
                    onChange={e => setAuthForm(p => ({ ...p, name: e.target.value }))}
                    style={{ flex: 1, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, outline: 'none' }}
                  />
                  <input type="email" placeholder="Email address" value={authForm.email}
                    onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAuthSend()}
                    style={{ flex: 1, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, outline: 'none' }}
                  />
                </div>
                <button onClick={handleAuthSend} disabled={authForm.loading}
                  style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 10, background: '#166534', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >{authForm.loading ? 'Sending code…' : 'Continue →'}</button>
              </>
            )}
          </div>
        )}

        {/* Accuracy Vote */}
        <div style={{ background: 'white', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 15, marginBottom: 4 }}>How accurate is this answer?</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
            {totalVotes > 0 ? `${totalVotes} vote${totalVotes !== 1 ? 's' : ''} so far` : 'Be the first to vote'}
          </div>
          <div style={{ display: 'flex', gap: 8, opacity: !user && !myVote ? 0.5 : 1, pointerEvents: !user && !myVote ? 'none' : 'auto' }}>
            {(['accurate', 'partial', 'inaccurate'] as const).map(r => (
              <button key={r} onClick={() => handleVote(r)} style={voteStyle(r)}>
                <span style={{ fontSize: 20 }}>{r === 'accurate' ? '✅' : r === 'partial' ? '🤔' : '❌'}</span>
                <span>{r === 'accurate' ? 'Accurate' : r === 'partial' ? 'Partial' : 'Off track'}</span>
                {totalVotes > 0 && <span style={{ fontSize: 11, fontWeight: 400 }}>{votes[r]}</span>}
              </button>
            ))}
          </div>
          {!user && !myVote && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
              ☝️ Enter your name & email above to unlock voting
            </div>
          )}
          {selectedVote && !myVote && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={() => setSelectedVote(null)}
                style={{ flex: 1, padding: '10px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >Change</button>
              <button onClick={confirmVote}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, background: '#166534', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >✓ Confirm Vote</button>
            </div>
          )}
          {myVote && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
              ✓ Thanks for voting! Your input helps improve GrowBot.
            </div>
          )}
          {/* Voter names */}
          {voteDetails.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {voteDetails.filter(v => v.voter_name).map((v, i) => (
                <span key={i} style={{ fontSize: 11, background: v.rating === 'accurate' ? '#dcfce7' : v.rating === 'partial' ? '#fef3c7' : '#fee2e2', color: '#374151', borderRadius: 12, padding: '2px 8px' }}>
                  {v.rating === 'accurate' ? '✅' : v.rating === 'partial' ? '🤔' : '❌'} {v.voter_name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Community Suggestions */}
        <div style={{ background: 'white', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 15, marginBottom: 4 }}>💡 Better suggestions from the community</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Share what you would do differently</div>

          {/* Add suggestion */}
          {user ? (
            <div style={{ marginBottom: 16 }}>
              {suggestionPosted && (
                <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                  ✓ Suggestion posted — thank you!
                </div>
              )}
              <textarea value={newSuggestion} onChange={e => { setNewSuggestion(e.target.value); setSuggestionPosted(false) }}
                placeholder="Add your alternative suggestion…"
                rows={3}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', minHeight: 72, marginBottom: 8 }}
              />
              <button onClick={handleSuggest} disabled={!newSuggestion.trim() || submitting}
                style={{ background: !newSuggestion.trim() ? '#d1d5db' : '#166534', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: !newSuggestion.trim() ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, float: 'right' }}
              >{submitting ? 'Posting…' : 'Post Suggestion'}</button>
              <div style={{ clear: 'both' }} />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '8px 10px', textAlign: 'center', marginBottom: 16 }}>
              ☝️ Enter your name & email above to add suggestions
            </div>
          )}

          {/* Suggestions list */}
          {suggestions.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, padding: '16px 0' }}>No suggestions yet — be the first!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {suggestions.map(s => (
                <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: '#f9fafb', borderRadius: 12 }}>
                  <button onClick={() => handleUpvote(s)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, background: upvotedIds.has(s.id) ? '#dcfce7' : 'white', border: `1px solid ${upvotedIds.has(s.id) ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 8, padding: '4px 8px', cursor: upvotedIds.has(s.id) ? 'default' : 'pointer', minWidth: 40 }}
                  >
                    <span style={{ fontSize: 14 }}>▲</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: upvotedIds.has(s.id) ? '#166534' : '#374151' }}>{s.upvotes}</span>
                  </button>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{s.suggestion_text}</div>
                    {s.voter_name && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>— {s.voter_name}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Growth CTA */}
        <div style={{ background: 'linear-gradient(135deg, #14532d, #166534)', borderRadius: 20, padding: '24px 20px', textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Get personalized gardening advice</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 18 }}>Ask GrowBot about your plants, diagnose issues, discover recipes, and more — free on CasaGrown</div>
          <Link href="/growbot" style={{ display: 'inline-block', background: 'white', color: '#166534', fontWeight: 700, fontSize: 15, padding: '12px 28px', borderRadius: 30, textDecoration: 'none' }}>
            Try GrowBot Free →
          </Link>
        </div>
      </div>
    </div>
  )
}
