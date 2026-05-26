'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase'
import { useAuth } from '../../../../../lib/useAuth'
import { BotSuggestionBar } from '../../../../components/BotSuggestionBar'
import { useSubscription } from '../../../../../lib/useSubscription'

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

export default function MessengerThreadPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const conversationId = params.id as string

  const [conversation, setConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const { isPro } = useSubscription()
  const [assistLoading, setAssistLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const EMOJI_LIST = ['👍', '❤️', '🎉', '😂', '😮', '🌱', '🤝', '💯']

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleChoosePhoto = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || uploadingMedia || sending || !user) return

    setUploadingMedia(true)
    const supabase = createClient()
    const fileExt = file.name.split('.').pop()
    const fileName = `${conversationId}/${Date.now()}.${fileExt}`

    try {
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage.from('chat-media').getPublicUrl(fileName)
      const publicUrl = data.publicUrl

      // Send the uploaded photo URL as a message
      setInputText(publicUrl)
      setTimeout(() => {
        const form = document.querySelector('.messenger-chat-form')
        if (form) {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        }
      }, 50)
    } catch (err: any) {
      console.error('[PHOTO UPLOAD] Failed:', err.message)
      setErrorToast('Failed to upload photo')
      setTimeout(() => setErrorToast(null), 3000)
    } finally {
      setUploadingMedia(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  // Handle GrowBot Assist manual trigger for Facebook Messenger
  const handleGrowBotAssist = async () => {
    if (showSuggestions) {
      setShowSuggestions(false)
      return
    }

    setShowSuggestions(true)
    setAssistLoading(true)
    try {
      const supabase = createClient()
      const lastBuyerMsg = [...messages].reverse().find(m => m.role === 'buyer' || m.role === 'user')
      const triggerMsgId = lastBuyerMsg?.id || 'fake-id'

      const { error } = await supabase.functions.invoke('auto-reply-seller-chat', {
        body: {
          type: 'messenger',
          messageId: triggerMsgId,
          senderId: conversation?.fb_sender_id || 'buyer',
          recipientId: user?.id,
          conversationId: conversationId,
          isManual: true,
        }
      })

      if (error) {
        console.error('[GROWBOT ASSIST] Trigger error:', error.message)
      }
    } catch (err) {
      console.error('[GROWBOT ASSIST] Invoke failed:', err)
    } finally {
      setAssistLoading(false)
    }
  }

  // Load conversation + messages
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    let isMounted = true
    const supabase = createClient()

    const fetchThread = async () => {
      // Fetch conversation metadata
      const { data: convData, error: convError } = await supabase
        .from('messenger_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('seller_id', user.id)
        .single()

      if (convError || !convData) {
        if (isMounted) router.replace('/messages')
        return
      }

      if (isMounted) {
        setConversation(convData)
      }

      // Fetch messages
      const { data: msgData } = await supabase
        .from('messenger_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (isMounted && msgData) {
        setMessages(msgData)
        setLoading(false)
        setTimeout(scrollToBottom, 150)
      }
    }

    fetchThread()

    return () => { isMounted = false }
  }, [user, authLoading, conversationId, router])

  // --- 📡 Seller Real-time Presence Heartbeat ---
  useEffect(() => {
    if (!user || loading || authLoading) return

    const supabase = createClient()
    const updatePresence = async () => {
      if (document.visibilityState !== 'visible') return
      await supabase
        .from('messenger_conversations')
        .update({ seller_last_active_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    // Initial update
    updatePresence()

    // Heartbeat interval every 5 seconds
    const interval = setInterval(updatePresence, 5000)

    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        updatePresence()
      }
    }
    document.addEventListener('visibilitychange', handleVis)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [user, conversationId, loading, authLoading])

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user || !conversation) return

    const supabase = createClient()
    
    const channel = supabase
      .channel(`messenger-thread-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messenger_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Reload messages on new insert
          supabase
            .from('messenger_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              if (data) {
                setMessages(prev => {
                  if (prev.length < data.length) setTimeout(scrollToBottom, 50)
                  return data
                })
              }
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, conversation, conversationId])

  // Handle sending a reply
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!inputText.trim() || sending || !user) return

    setSending(true)
    const supabase = createClient()

    try {
      const res = await supabase.functions.invoke('send-messenger-reply', {
        body: {
          conversation_id: conversationId,
          message: inputText.trim(),
          seller_id: user.id,
        },
      })

      if (res.error) {
        setErrorToast('Failed to send message: ' + (res.error?.message || 'Unknown error'))
        setTimeout(() => setErrorToast(null), 3500)
      } else {
        setInputText('')
        if (inputRef.current) inputRef.current.style.height = 'auto'
        setShowSuggestions(false)

        // Optimistic refresh
        const { data: fetchNew } = await supabase
          .from('messenger_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
        if (fetchNew) {
          setMessages(fetchNew)
          setTimeout(scrollToBottom, 150)
        }
      }
    } catch (err: any) {
      setErrorToast('Failed to send message')
      setTimeout(() => setErrorToast(null), 3500)
    }
    
    setSending(false)
  }

  // Handle BotSuggestionBar send
  const handleBotSend = (text: string) => {
    setInputText(text)
    setShowSuggestions(false)
    setTimeout(() => {
      const form = document.querySelector('.messenger-chat-form')
      if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
    }, 50)
  }

  if (loading || authLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading thread...</div>

  const displayName = conversation?.fb_sender_id
    ? `FB User ${conversation.fb_sender_id.slice(-4)}`
    : 'Facebook Customer'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 144px)', maxWidth: '100vw', overflow: 'hidden', background: '#f9fafb' }}>
      
      {/* Toast Error Banner */}
      {errorToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: 'white', padding: '12px 24px', borderRadius: 8, zIndex: 1000, fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          {errorToast}
        </div>
      )}

      {/* Sticky Header */}
      <header style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <button onClick={() => router.back()} style={{ marginRight: 16, textDecoration: 'none', color: '#16a34a', fontSize: '1.25rem', padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>
          ←
        </button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#e7f0ff', overflow: 'hidden', marginRight: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          📱
        </div>
        <div style={{ flexGrow: 1 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
            {displayName}
            <span style={{ fontSize: 10, background: '#1877F2', color: 'white', padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>Messenger</span>
          </h2>
        </div>
      </header>

      {/* Message Feed */}
      <main style={{ flexGrow: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Forces messages to bottom-align */}
        <div style={{ flexGrow: 1, minHeight: 20 }} />
        
        {messages.map((msg, idx) => {
          const role = msg.role === 'user' ? 'buyer' : msg.role
          const isMe = role === 'seller'
          const isBot = role === 'bot'
          
          const msgDate = new Date(msg.created_at).toDateString()
          const prevMsgDate = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null
          const showDateSeparator = msgDate !== prevMsgDate

          // Bot messages centered, buyer left, seller right
          const justifyContent = isBot ? 'center' : isMe ? 'flex-end' : 'flex-start'

          const isImage = msg.content && msg.content.startsWith('http') && (
            msg.content.includes('chat-media') ||
            msg.content.includes('.png') ||
            msg.content.includes('.jpg') ||
            msg.content.includes('.jpeg') ||
            msg.content.includes('.webp') ||
            msg.content.includes('fbcdn.net') ||
            msg.content.includes('scontent')
          )

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div style={{ textAlign: 'center', margin: '24px 0 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {formatDateLabel(msg.created_at)}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent, marginBottom: 8 }}>
                
                {/* Buyer avatar */}
                {role === 'buyer' && (
                  <div style={{ width: 28, height: 28, marginRight: 8, alignSelf: 'flex-end' }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#e7f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#1877F2', fontWeight: 'bold' }}>📱</div>
                  </div>
                )}

                {/* Bot icon */}
                {isBot && (
                  <div style={{ width: 28, height: 28, marginRight: 8, alignSelf: 'flex-end' }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#fef08a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🤖</div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : isBot ? 'center' : 'flex-start', maxWidth: '78%' }}>
                  
                  {/* Role label for bot */}
                  {isBot && (
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, fontWeight: 600 }}>GrowBot</div>
                  )}

                  {/* Bubble */}
                  <div style={{ 
                    background: isMe ? '#dcfce7' : isBot ? '#fef9c3' : 'white', 
                    color: isMe ? '#166534' : isBot ? '#713f12' : '#1f2937',
                    border: isMe ? 'none' : isBot ? '1px solid #fde68a' : '1px solid #e5e7eb',
                    borderRadius: '18px',
                    borderBottomRightRadius: isMe ? 4 : 18,
                    borderBottomLeftRadius: !isMe && !isBot ? 4 : 18,
                    overflow: 'hidden',
                    boxShadow: isMe ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                    width: '100%',
                  }}>
                    {msg.content && (
                      <div style={{ padding: '10px 14px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {isImage ? (
                          <img src={msg.content} alt="Attachment" style={{ maxWidth: '100%', height: 'auto', display: 'block', borderRadius: 12, margin: '4px 0' }} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    )}
                    
                    {/* Timestamp */}
                    <div style={{ fontSize: 10, color: isMe ? 'rgba(22, 101, 52, 0.7)' : '#9ca3af', textAlign: 'right', padding: '0 12px 6px' }}>
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} style={{ height: 1, paddingBottom: 24 }} />
      </main>

      {/* Bot Suggestion Bar */}
      {showSuggestions && (
        <div style={{ padding: '0 16px' }}>
          <BotSuggestionBar
            channel="messenger"
            conversationRef={`messenger_${conversationId}`}
            onSend={handleBotSend}
            isLoading={assistLoading}
            onSelect={(text: string) => {
              setInputText(text)
              if (inputRef.current) {
                inputRef.current.focus()
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.selectionStart = text.length
                    inputRef.current.selectionEnd = text.length
                  }
                }, 50)
              }
            }}
          />
        </div>
      )}

      {/* Compose Footer */}
      <footer style={{ background: 'white', padding: '12px 16px', borderTop: '1px solid #e5e7eb', zIndex: 10 }}>
        {isPro && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <button
              type="button"
              disabled={sending || assistLoading}
              onClick={handleGrowBotAssist}
              style={{
                flexShrink: 0,
                background: showSuggestions
                  ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                  : 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                border: showSuggestions ? '1px solid #34d399' : '1px solid #38bdf8',
                padding: '6px 12px',
                borderRadius: 9999,
                fontSize: '0.8rem',
                color: showSuggestions ? '#065f46' : '#0369a1',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                fontWeight: 600,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                opacity: sending || assistLoading ? 0.5 : 1,
              }}
            >
              {assistLoading ? '🤖 Thinking...' : '🤖 Suggest Reply'}
            </button>
          </div>
        )}
        <form className="messenger-chat-form" onSubmit={handleSend} style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
          
          <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" style={{ display: 'none' }} disabled={uploadingMedia || sending} />

          {/* 😀 Quick Emojis */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button type="button" title="Emojis" onClick={() => setShowEmojiPicker(!showEmojiPicker)} disabled={uploadingMedia || sending} style={{ background: '#f3f4f6', color: '#4b5563', border: 'none', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploadingMedia || sending ? 0.5 : 1 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            
            {showEmojiPicker && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowEmojiPicker(false)} />
                <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: '8px 12px', display: 'flex', gap: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50 }}>
                  {EMOJI_LIST.map(em => (
                    <button key={em} type="button" onClick={() => { setInputText(prev => prev + em); setShowEmojiPicker(false); inputRef.current?.focus() }} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', padding: 4, transition: 'transform 0.1s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.2)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                      {em}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 📸 Attach Photo */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button type="button" title="Attach Photo" onClick={handleChoosePhoto} disabled={uploadingMedia || sending} style={{ background: '#f3f4f6', color: '#4b5563', border: 'none', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploadingMedia || sending ? 0.5 : 1 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
          </div>

          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            placeholder={uploadingMedia ? "Uploading..." : "Reply via Messenger..."}
            disabled={uploadingMedia || sending}
            style={{
              flexGrow: 1,
              padding: '10px 16px',
              borderRadius: 24,
              border: '1px solid #d1d5db',
              background: 'white',
              fontSize: '1rem',
              outline: 'none',
              resize: 'none',
              overflowY: 'hidden',
              lineHeight: '1.4',
              maxHeight: 120,
              fontFamily: 'inherit',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />

          <button 
            type="submit"
            disabled={sending || uploadingMedia || !inputText.trim()}
            style={{ background: (inputText.trim() && !uploadingMedia) ? '#1877F2' : '#9ca3af', color: 'white', border: 'none', width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (inputText.trim() && !uploadingMedia) ? 'pointer' : 'default', transition: 'background 0.2s', flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
      </footer>
    </div>
  )
}
