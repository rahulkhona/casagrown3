'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

interface BotSuggestionBarProps {
  channel: 'dm' | 'order' | 'messenger'
  conversationRef: string  // conversation_id or order_id
  onSend: (text: string) => void
  onSelect?: (text: string) => void
  isLoading?: boolean
}

/**
 * BotSuggestionBar — Shows GrowBot's suggested replies to the seller.
 * Subscribes to bot_reply_drafts in realtime.
 * Shows countdown timer for auto-send.
 * Seller can tap to send, edit, or dismiss.
 */
export function BotSuggestionBar({ channel, conversationRef, onSend, onSelect, isLoading }: BotSuggestionBarProps) {
  const supabase = createClient()
  const { user } = useAuth()
  const [draft, setDraft] = useState<any>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)

  // Load and subscribe to pending drafts for this conversation
  useEffect(() => {
    if (!conversationRef || !user) return

    // Initial load
    const loadDraft = async () => {
      const { data } = await supabase
        .from('bot_reply_drafts')
        .select('*')
        .eq('channel', channel)
        .eq('conversation_ref', conversationRef)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) setDraft(data)
      else setDraft(null)
    }

    loadDraft()

    // Realtime subscription
    const sub = supabase
      .channel(`bot-drafts-${conversationRef}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bot_reply_drafts',
        filter: `conversation_ref=eq.${conversationRef}`,
      }, (payload: any) => {
        if (payload.eventType === 'INSERT' && (payload.new as any).status === 'pending') {
          setDraft(payload.new)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as any
          if (updated.status !== 'pending') {
            setDraft(null) // Draft was resolved
          } else {
            setDraft(updated)
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [conversationRef, channel, user])

  // Countdown timer
  useEffect(() => {
    if (!draft?.auto_send_at) { setCountdown(0); return }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((new Date(draft.auto_send_at).getTime() - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) setDraft(null) // Timer expired, draft will be processed server-side
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [draft?.auto_send_at])

  if (!draft) {
    if (isLoading) {
      return (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
          borderRadius: 12, padding: '12px 14px',
          border: '1px solid #86efac',
          marginBottom: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          animation: 'pulse 1.8s ease-in-out infinite',
        }}>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: translateY(0); }
              50% { opacity: 0.6; transform: translateY(1px); }
            }
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block',
              animation: 'spin 2s linear infinite',
              fontSize: 14,
            }}>
              ⚙️
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>
              🤖 GrowBot is drafting replies...
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              height: 36,
              background: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
            }}>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, width: '85%' }} />
            </div>
            <div style={{
              height: 36,
              background: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
            }}>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, width: '60%' }} />
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const suggestions: string[] = typeof draft.suggestions === 'string'
    ? JSON.parse(draft.suggestions)
    : draft.suggestions || []

  if (suggestions.length === 0) return null

  const handleSend = async (index: number) => {
    setSending(true)
    try {
      // Call process-bot-replies with specific draft + selected index
      const { error } = await supabase.functions.invoke('process-bot-replies', {
        body: { draftId: draft.id, selectedIndex: index }
      })
      if (!error) {
        setDraft(null)
        if (onSend) onSend(suggestions[index])
      }
    } finally {
      setSending(false)
    }
  }

  const handleSendEdited = async () => {
    if (!editText.trim()) return
    setSending(true)
    try {
      // Update draft with edited text, then send
      await supabase
        .from('bot_reply_drafts')
        .update({ suggestions: JSON.stringify([editText, ...suggestions.slice(1)]) })
        .eq('id', draft.id)

      const { error } = await supabase.functions.invoke('process-bot-replies', {
        body: { draftId: draft.id, selectedIndex: 0 }
      })
      if (!error) {
        setDraft(null)
        setEditing(false)
        if (onSend) onSend(editText)
      }
    } finally {
      setSending(false)
    }
  }

  const handleCancel = async () => {
    await supabase
      .from('bot_reply_drafts')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('id', draft.id)
    setDraft(null)
  }

  const minutes = Math.floor(countdown / 60)
  const seconds = countdown % 60
  const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const hasTimer = countdown > 0 && countdown < 86400 && channel !== 'order'

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
      borderRadius: 12, padding: '12px 14px',
      border: '1px solid #86efac',
      marginBottom: 8,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>
          🤖 GrowBot suggests:
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasTimer && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#92400e',
              background: '#fef9c3', padding: '2px 8px', borderRadius: 6,
            }}>
              ⏱️ {timerText}
            </span>
          )}
          <button
            onClick={handleCancel}
            style={{
              fontSize: 11, color: '#9ca3af', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Buyer's message context */}
      {draft.buyer_message && (
        <div style={{
          fontSize: 11, color: '#6b7280', marginBottom: 8,
          fontStyle: 'italic',
        }}>
          Replying to: "{draft.buyer_message.slice(0, 100)}"
        </div>
      )}

      {editing ? (
        /* Edit mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{
              width: '100%', minHeight: 60, padding: 8, fontSize: 13,
              border: '1px solid #d1d5db', borderRadius: 8, resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleSendEdited}
              disabled={sending}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600,
                background: '#059669', color: 'white', border: 'none',
                borderRadius: 6, cursor: 'pointer',
                opacity: sending ? 0.5 : 1,
              }}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{
                padding: '5px 12px', fontSize: 12,
                background: '#f3f4f6', border: '1px solid #d1d5db',
                borderRadius: 6, cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        /* Suggestion cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map((text: string, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'white', borderRadius: 8, padding: '8px 10px',
              border: '1px solid #e5e7eb',
              cursor: onSelect ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
            }}
            onClick={() => {
              if (onSelect) onSelect(text)
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#86efac';
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <div style={{
                flex: 1, fontSize: 13, color: '#374151', lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
              }}>
                {text}
              </div>
              <div 
                style={{ display: 'flex', gap: 4, flexShrink: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                {onSelect && (
                  <button
                    onClick={() => onSelect(text)}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                      borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Select
                  </button>
                )}
                <button
                  onClick={() => handleSend(i)}
                  disabled={sending}
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600,
                    background: '#dcfce7', color: '#166534', border: '1px solid #86efac',
                    borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                    opacity: sending ? 0.5 : 1,
                  }}
                >
                  Send
                </button>
                <button
                  onClick={() => { setEditing(true); setEditText(text) }}
                  style={{
                    padding: '4px 8px', fontSize: 11,
                    background: '#f3f4f6', border: '1px solid #d1d5db',
                    borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  ✏️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-send notice */}
      {hasTimer && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>
          Auto-sending top reply in {timerText} if you don't respond
        </div>
      )}
    </div>
  )
}
