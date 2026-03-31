'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'
import { checkTextForViolations } from '../../../../lib/moderation'
import CameraCapture from '../../../../components/CameraCapture'
import ImageCropper from '../../../../components/ImageCropper'
import { BlockModal } from '../../../components/BlockModal'

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

export default function MessageThreadPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  
  const [messages, setMessages] = useState<any[]>([])
  const [conversation, setConversation] = useState<any>(null)
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [myRole, setMyRole] = useState<'participant_a' | 'participant_b' | null>(null)
  const [otherUser, setOtherUser] = useState<any>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [unblockLoading, setUnblockLoading] = useState(false)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null)
  const [replyingToMessage, setReplyingToMessage] = useState<any>(null)
  const EMOJIS = ['👍', '❤️', '🎉', '😂', '😮', '🌱']
  
  // Media & Offer & Emoji State
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [myProducts, setMyProducts] = useState<any[]>([])

  const EMOJI_LIST = ['👍', '❤️', '🎉', '😂', '😮', '🌱', '🤝', '💯']

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  // File handling helpers
  const handleAttachClick = () => setShowAttachMenu(!showAttachMenu)
  const handleTakePhoto = () => {
    setShowAttachMenu(false)
    setShowCamera(true)
  }
  const handleChoosePhoto = () => {
    setShowAttachMenu(false)
    fileInputRef.current?.click()
  }

  // Clear unread count helper
  const clearUnreadCount = async (supabase: any, role: string) => {
    if (!role) return
    
    // 🔥 Optimistic Sync: Tell the entire App to drop its unread badges INSTANTLY (0ms latency!)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('force-badge-update'))
    
    const updateColumn = role === 'participant_a' ? 'unread_count_a' : 'unread_count_b'
    
    // 1. Clear local DM unread badge
    const { error } = await supabase.from('market_conversations')
      .update({ [updateColumn]: 0 })
      .eq('id', id)
      
    // 2. Clear global bell notifications pointing specifically to this active channel
    if (user?.id) {
      supabase.from('market_notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('link_url', `/messages/${id}`)
        .then()
    }
  }

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
        .from('market_conversations')
        .select('*, profile_a:profiles!market_conversations_participant_a_fkey(id, full_name, avatar_url), profile_b:profiles!market_conversations_participant_b_fkey(id, full_name, avatar_url)')
        .eq('id', id)
        .single()

      if (convError || !convData) {
        if (isMounted) router.replace('/messages')
        return
      }

      const role = convData.participant_a === user.id ? 'participant_a' : 'participant_b'
      const other = role === 'participant_a' ? convData.profile_b : convData.profile_a
      
      if (isMounted) {
        setConversation(convData)
        setMyRole(role)
        setOtherUser(other)
        clearUnreadCount(supabase, role)
      }

      // Check if blocked
      const { data: blockCheck } = await supabase
        .from('market_blocks')
        .select('id, blocker_id')
        .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${other.id}),and(blocker_id.eq.${other.id},blocked_id.eq.${user.id})`)
      
      if (isMounted && blockCheck && blockCheck.length > 0) {
        setIsBlocked(true)
      }

      // Fetch message history
      const { data: msgData } = await supabase
        .from('market_chat_messages')
        .select(`*, offer_product:market_products(id, name, price_usd, photos, unit, seller_id), market_chat_reactions(user_id, emoji)`)
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })

      if (isMounted && msgData) {
        setMessages(prev => {
          if (prev.length < msgData.length) setTimeout(scrollToBottom, 150)
          return msgData
        })
        // Always bounce to bottom when opening the chat cold
        if (loading) setTimeout(scrollToBottom, 150)
        setLoading(false)
      }
    }

    fetchThread()

    // Smart Polling (3s pulse)
    const interval = setInterval(() => {
        fetchThread()
    }, 3000)

    return () => {
        isMounted = false
        clearInterval(interval)
    }
  }, [user, authLoading, id, router])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if ((!inputText.trim() && mediaFiles.length === 0) || sending || isBlocked || !user) return

    // Anti-harassment: Inline moderation check if there's text
    if (inputText.trim()) {
      const modCheck = checkTextForViolations(inputText)
      if (!modCheck.isClean) {
        setErrorToast(modCheck.error || "Message was blocked by community safety guidelines.")
        setTimeout(() => setErrorToast(null), 3500)
        return
      }
    }

    setSending(true)
    const supabase = createClient()
    
    // Upload media if present
    const uploadedUrls: string[] = []
    if (mediaFiles.length > 0) {
      setUploadingMedia(true)
      for (const file of mediaFiles) {
        const fileExt = file.name.split('.').pop() || 'jpg'
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, file)
        
        if (!uploadError) {
          const { data } = supabase.storage.from('chat-media').getPublicUrl(fileName)
          if (data?.publicUrl) uploadedUrls.push(data.publicUrl)
        }
      }
      setUploadingMedia(false)
    }

    const { error } = await supabase.from('market_chat_messages').insert({
      conversation_id: id,
      sender_id: user.id,
      parent_id: replyingToMessage ? replyingToMessage.id : null,
      content: inputText.trim() || null,
      media: uploadedUrls.length > 0 ? uploadedUrls : null
    })

    if (error) {
      if (error.message.includes('market_blocks')) {
          setErrorToast("You cannot message this user.")
          setIsBlocked(true)
      } else {
          setErrorToast("Failed to send message.")
      }
      setTimeout(() => setErrorToast(null), 3000)
      setSending(false)
      return
    }

    setInputText('')
    setMediaFiles([])
    setMediaPreviews([])
    setReplyingToMessage(null)
    setSending(false)
    
    // Optimistic refresh
    const { data: fetchNew } = await supabase.from('market_chat_messages').select('*, offer_product:market_products(id, name, price_usd, photos, unit, seller_id)').eq('conversation_id', id).order('created_at', { ascending: true })
    if (fetchNew) {
      setMessages(fetchNew)
      setTimeout(scrollToBottom, 150)
    }
  }

  const addFile = (file: File) => {
    if (!file || uploadingMedia || isBlocked || !user) return
    if (mediaFiles.length >= 4) {
      setErrorToast("Maximum 4 photos per message")
      setTimeout(() => setErrorToast(null), 3000)
      return
    }
    setMediaFiles(prev => [...prev, file])
    setMediaPreviews(prev => [...prev, URL.createObjectURL(file)])
  }
  
  const removeMedia = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index])
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
    setMediaPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    setActiveReactionMessageId(null)
    if (!user) return
    const supabase = createClient()
    
    // Optimistic local update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      
      const reactions = m.market_chat_reactions || []
      const existingIdx = reactions.findIndex((r: any) => r.emoji === emoji && r.user_id === user.id)
      
      let nextReactions = [...reactions]
      if (existingIdx >= 0) {
         nextReactions.splice(existingIdx, 1)
         supabase.from('market_chat_reactions').delete().match({ message_id: messageId, user_id: user.id, emoji }).then()
      } else {
         nextReactions.push({ message_id: messageId, user_id: user.id, emoji })
         supabase.from('market_chat_reactions').insert({ message_id: messageId, user_id: user.id, emoji }).then()
      }
      return { ...m, market_chat_reactions: nextReactions }
    }))
  }

  const handleMessageShare = async (msg: any) => {
    setActiveReactionMessageId(null)
    const textToShare = msg.content || '📷 Shared a photo'
    const urlToShare = msg.media && msg.media.length > 0 ? msg.media[0] : undefined
    
    if (navigator.share) {
      try {
        await navigator.share({
          text: textToShare,
          url: urlToShare
        })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }
    
    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(urlToShare ? `${textToShare}\n${urlToShare}` : textToShare)
      setErrorToast('Copied to clipboard!')
      setTimeout(() => setErrorToast(null), 2000)
    } catch {}
  }

  // 📸 Handle Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => setCropSrc(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  // 🛍️ Handle Offer
  const loadMyProducts = async () => {
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase.from('market_products').select('id, name, price_usd, photos, unit').eq('seller_id', user.id).eq('is_deleted', false).eq('is_active', true)
    setMyProducts(data || [])
    setShowOfferModal(true)
  }

  const sendOffer = async (productId: string) => {
    setShowOfferModal(false)
    if (isBlocked || !user) return
    const supabase = createClient()
    await supabase.from('market_chat_messages').insert({
      conversation_id: id,
      sender_id: user.id,
      content: "🛍️ Check out this offer!",
      offer_product_id: productId
    })
    const { data: fetchNew } = await supabase.from('market_chat_messages').select('*, offer_product:market_products(id, name, price_usd, photos, unit, seller_id)').eq('conversation_id', id).order('created_at', { ascending: true })
    if (fetchNew) setMessages(fetchNew)
    setTimeout(scrollToBottom, 50)
  }

  const handleUnblockUser = async () => {
    if (!otherUser || !user) return
    setUnblockLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('market_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', otherUser.id)
      
    if (error) {
      setErrorToast("Failed to unblock: " + error.message)
      setTimeout(() => setErrorToast(null), 3000)
    } else {
      setIsBlocked(false)
    }
    setUnblockLoading(false)
  }

  if (loading || authLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading thread...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 130px)', background: '#f9fafb' }}>
      
      {/* Toast Error Banner */}
      {errorToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: 'white', padding: '12px 24px', borderRadius: 8, zIndex: 1000, fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          {errorToast}
        </div>
      )}

      {/* Styled Block Modal Resolution */}
      {showBlockModal && otherUser && user && (
        <BlockModal
          userIdToBlock={otherUser.id}
          userName={otherUser.full_name || 'Neighbor'}
          currentUserId={user.id}
          onClose={() => setShowBlockModal(false)}
          onBlocked={() => { setIsBlocked(true); setShowBlockModal(false) }}
        />
      )}

      {/* Sticky Header */}
      <header style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, position: 'relative' }}>
        <button onClick={() => router.back()} style={{ marginRight: 16, textDecoration: 'none', color: '#16a34a', fontSize: '1.25rem', padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>
          ←
        </button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#e5e7eb', overflow: 'hidden', marginRight: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {otherUser?.avatar_url ? (
            <img src={otherUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontWeight: 'bold', color: '#9ca3af' }}>{otherUser?.full_name?.charAt(0).toUpperCase() || '?'}</span>
          )}
        </div>
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#111827' }}>{otherUser?.full_name || 'Neighbor'}</h2>
          
          {/* Explicit Block/Unblock Button Logic */}
          {isBlocked ? (
            <button onClick={handleUnblockUser} disabled={loading || authLoading || unblockLoading} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontSize: '0.8rem', fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', marginLeft: 12 }}>
               🔓 Unblock
            </button>
          ) : (
            <button onClick={() => setShowBlockModal(true)} disabled={loading || authLoading} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', marginLeft: 12 }}>
               🚫 Block
            </button>
          )}
        </div>
      </header>

      {/* Message Feed */}
      <main style={{ flexGrow: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Forces messages to bottom-align if there are only a few */ }
        <div style={{ flexGrow: 1, minHeight: 20 }} />
        
        {messages.map((msg, idx) => {
          const isMe = msg.sender_id === user?.id
          const showAvatar = !isMe && (idx === messages.length - 1 || messages[idx + 1]?.sender_id !== msg.sender_id)
          
          const msgDate = new Date(msg.created_at).toDateString()
          const prevMsgDate = idx > 0 ? new Date(messages[idx-1].created_at).toDateString() : null
          const showDateSeparator = msgDate !== prevMsgDate
          
          const reactionCounts: Record<string, number> = {}
          const userReactions: string[] = []
          if (msg.market_chat_reactions) {
            msg.market_chat_reactions.forEach((r: any) => {
              reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1
              if (r.user_id === user?.id) userReactions.push(r.emoji)
            })
          }

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div style={{ textAlign: 'center', margin: '24px 0 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {formatDateLabel(msg.created_at)}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              {!isMe && (
                <div style={{ width: 28, height: 28, marginRight: 8, alignSelf: 'flex-end', opacity: showAvatar ? 1 : 0 }}>
                  {otherUser?.avatar_url ? (
                     <img src={otherUser.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                     <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#9ca3af', fontWeight: 'bold' }}>{otherUser?.full_name?.charAt(0).toUpperCase()}</div>
                  )}
                </div>
              )}
              
              {/* Bubble wrapper flex column to cleanly stack reaction counts underneath */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '78%', position: 'relative' }}>
                
                {/* Reaction Popover Array (Escaped from hidden overflow) */}
                {activeReactionMessageId === msg.id && (
                  <div style={{ position: 'absolute', top: -38, [isMe ? 'right' : 'left']: 0, background: 'white', borderRadius: 24, padding: '4px 8px', display: 'flex', gap: 6, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', zIndex: 50, border: '1px solid #e5e7eb', alignItems: 'center' }}>
                    
                    {/* Emojis */}
                    {EMOJIS.map(emoji => {
                      const hasReacted = userReactions.includes(emoji)
                      return (
                        <button 
                          key={emoji} 
                          onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg.id, emoji) }} 
                          style={{ border: 'none', background: hasReacted ? '#dcfce7' : 'transparent', borderRadius: '50%', width: 34, height: 34, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}
                        >
                          {emoji}
                        </button>
                      )
                    })}

                    {/* Actions: Reply and Share */}
                    <div style={{ display: 'flex', gap: 6, paddingLeft: 8, marginLeft: 2, borderLeft: '1px solid #e5e7eb' }}>
                      <button 
                        title="Reply"
                        onClick={(e) => { e.stopPropagation(); setReplyingToMessage(msg); setActiveReactionMessageId(null); setTimeout(() => inputRef.current?.focus(), 50) }}
                        style={{ border: 'none', background: 'transparent', width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      </button>
                      
                      <button 
                        title="Copy / Share Message"
                        onClick={(e) => { e.stopPropagation(); handleMessageShare(msg) }}
                        style={{ border: 'none', background: 'transparent', width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: 22, color: '#6b7280', fontWeight: 'bold' }}
                      >
                        ↗
                      </button>
                    </div>

                  </div>
                )}

                {/* Bubble Container */}
                <div 
                  onClick={() => setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id)}
                  style={{ 
                    background: isMe ? '#22c55e' : 'white', 
                    color: isMe ? 'white' : '#1f2937',
                    border: isMe ? 'none' : '1px solid #e5e7eb',
                    borderRadius: '18px',
                    borderBottomRightRadius: isMe ? 4 : 18,
                    borderBottomLeftRadius: !isMe ? 4 : 18,
                    overflow: 'hidden',
                    boxShadow: isMe ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  {/* Replied to message block directly inside bubble */}
                  {msg.parent_id && (
                     <div style={{ margin: '8px 8px 4px 8px', padding: '6px 10px', background: isMe ? 'rgba(255,255,255,0.2)' : '#f3f4f6', borderRadius: 12, borderLeft: isMe ? '3px solid white' : '3px solid #16a34a', fontSize: '0.85rem', color: isMe ? 'white' : '#4b5563', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, marginBottom: 2, fontSize: '0.75rem', opacity: 0.9 }}>Reply to</div>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                           {messages.find(m => m.id === msg.parent_id)?.content || 'Original message or photo'}
                        </div>
                     </div>
                  )}

                  {/* 1. Media Preview */}
                {msg.media && msg.media.length > 0 && (
                  <img src={msg.media[0]} alt="Attached" onLoad={scrollToBottom} style={{ width: '100%', maxHeight: 250, objectFit: 'cover', display: 'block', background: '#f3f4f6' }} />
                )}
                
                {/* 2. Text Content */}
                <div style={{ padding: '10px 14px', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>
                
                {/* 3. Offer Product Card */}
                {msg.offer_product && (
                  <div style={{ margin: '0 10px 10px', background: 'white', borderRadius: 12, padding: 12, color: '#1f2937', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <img src={msg.offer_product.photos?.[0] || '/placeholder.png'} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: '1.2' }}>{msg.offer_product.name}</div>
                        <div style={{ color: '#16a34a', fontWeight: 'bold', fontSize: 13 }}>${msg.offer_product.price_usd} / {msg.offer_product.unit}</div>
                      </div>
                    </div>
                    <Link href={`/market/booth/${msg.offer_product.seller_id}/product/${msg.offer_product.id}`} style={{ display: 'block', width: '100%', textAlign: 'center', background: '#111827', color: 'white', padding: '6px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      View Product →
                    </Link>
                  </div>
                )}
                
                {/* 4. Timestamp */}
                <div style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.8)' : '#9ca3af', textAlign: 'right', padding: '0 12px 6px' }}>
                  {formatTime(msg.created_at)}
                </div>
              </div>

                {/* 4. Sub-Bubble Reaction Counts */}
                {Object.keys(reactionCounts).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <button 
                        key={emoji} 
                        onClick={() => handleToggleReaction(msg.id, emoji)} 
                        style={{ display: 'flex', gap: 4, alignItems: 'center', background: userReactions.includes(emoji) ? '#dcfce7' : 'white', border: userReactions.includes(emoji) ? '1px solid #86efac' : '1px solid #e5e7eb', padding: '2px 6px', borderRadius: 12, fontSize: 13, cursor: 'pointer', color: '#374151', paddingBottom: 3 }}
                      >
                        <span style={{ fontSize: 12 }}>{emoji}</span>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{count}</span>
                      </button>
                    ))}
                  </div>
                )}

              </div>
            </div>
            </div>
          )
        })}
        {/* Typing indicator fallback area */}
        <div ref={messagesEndRef} style={{ height: 1, paddingBottom: 24 }} />
      </main>

      {/* Media Previews Wrapper */}
      {mediaPreviews.length > 0 && (
        <div style={{ padding: '8px 16px', background: 'white', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {mediaPreviews.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button 
                onClick={() => removeMedia(i)}
                style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Replying to Compose Preview */}
      {replyingToMessage && (
         <div style={{ background: '#f3f4f6', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.85rem', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 2 }}>
               <span style={{ fontWeight: 600, color: '#16a34a' }}>Replying to message</span>
               <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80vw' }}>{replyingToMessage.content || 'Attached media'}</div>
            </div>
            <button 
              onClick={() => setReplyingToMessage(null)} 
              title="Cancel Reply"
              style={{ border: 'none', background: '#e5e7eb', color: '#4b5563', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
         </div>
      )}

      {/* Compose Footer */}
      <footer style={{ background: 'white', padding: '12px 16px', borderTop: (mediaPreviews.length > 0 || replyingToMessage) ? 'none' : '1px solid #e5e7eb', zIndex: 10, position: 'relative' }}>
        {isBlocked ? (
          <div style={{ textAlign: 'center', padding: '12px', background: '#f3f4f6', borderRadius: 20, color: '#6b7280', fontSize: '0.875rem' }}>
            This conversation is blocked and cannot receive new messages.
          </div>
        ) : (
          <form className="chat-form" onSubmit={handleSend} style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
            
            {/* 😀 Quick Emojis */}
            <div style={{ position: 'relative' }}>
              <button type="button" title="Emojis" onClick={() => setShowEmojiPicker(!showEmojiPicker)} disabled={uploadingMedia || sending} style={{ background: '#f3f4f6', color: '#4b5563', border: 'none', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploadingMedia || sending ? 0.5 : 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              
              {showEmojiPicker && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowEmojiPicker(false)} />
                  <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: '8px 12px', display: 'flex', gap: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50 }}>
                    {EMOJI_LIST.map(em => (
                      <button key={em} type="button" onClick={() => { setInputText(prev => prev + em); setShowEmojiPicker(false) }} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', padding: 4, transition: 'transform 0.1s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.2)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                        {em}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 📸 Photos */}
            <div style={{ position: 'relative' }}>
              <input type="file" ref={cameraInputRef} onChange={handlePhotoUpload} accept="image/*" capture="environment" style={{ display: 'none' }} disabled={uploadingMedia || sending} />
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" style={{ display: 'none' }} disabled={uploadingMedia || sending} />
              
              <button type="button" onClick={handleAttachClick} disabled={uploadingMedia || sending} style={{ background: '#f3f4f6', color: '#4b5563', border: 'none', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploadingMedia || sending ? 0.5 : 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>

              {showAttachMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowAttachMenu(false)} />
                  <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={handleTakePhoto} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '8px 16px', textAlign: 'left', borderRadius: 12 }} onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                      📸 Take Photo
                    </button>
                    <button type="button" onClick={handleChoosePhoto} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '8px 16px', textAlign: 'left', borderRadius: 12 }} onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                      🖼️ Photo Library
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Action Chips */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={loadMyProducts} disabled={uploadingMedia || sending}
                style={{
                  background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', color: '#166534',
                  border: '1px solid #bbf7d0', borderRadius: 16, padding: '6px 12px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  opacity: uploadingMedia || sending ? 0.5 : 1, transition: 'all 0.15s',
                }}>
                🏷️ Sell
              </button>
              <button type="button" disabled={uploadingMedia || sending}
                onClick={async () => {
                  if (!user || isBlocked) return
                  const supabase = createClient()
                  // Get user's booth info for passcode
                  const { data: booth } = await supabase.from('booths').select('name, helper_passcode').eq('owner_id', user.id).maybeSingle()
                  const boothLabel = booth?.name?.trim() ? `my booth "${booth.name}"` : 'my CasaGrown booth'
                  const passcode = booth?.helper_passcode || ''
                  const joinUrl = passcode ? `${window.location.origin}/join-booth/${encodeURIComponent(passcode)}` : ''
                  const helpMsg = [
                    `Hey! 👋`,
                    '',
                    `I need some help managing my excess produce on CasaGrown and was wondering if you'd be able to help me out?`,
                    '',
                    `It's pretty straightforward — just keep an eye on orders, hand things off to buyers when they come by, and maybe reply to a message or two.`,
                    ...(joinUrl ? [
                      '',
                      `If you can, here's the link to get access to ${boothLabel}:`,
                      joinUrl,
                      '',
                      `Passcode: ${passcode}`,
                    ] : []),
                    '',
                    `Let me know! 🌱`,
                  ].join('\n')
                  await supabase.from('market_chat_messages').insert({
                    conversation_id: id,
                    sender_id: user.id,
                    content: helpMsg,
                  })
                  const { data: fetchNew } = await supabase.from('market_chat_messages').select('*, offer_product:market_products(id, name, price_usd, photos, unit, seller_id), market_chat_reactions(user_id, emoji)').eq('conversation_id', id).order('created_at', { ascending: true })
                  if (fetchNew) setMessages(fetchNew)
                  setTimeout(scrollToBottom, 50)
                }}
                style={{
                  background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', color: '#92400e',
                  border: '1px solid #fde68a', borderRadius: 16, padding: '6px 12px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  opacity: uploadingMedia || sending ? 0.5 : 1, transition: 'all 0.15s',
                }}>
                🤝 Request Help
              </button>
            </div>
            
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message..."
              disabled={isBlocked || uploadingMedia || sending}
              style={{
                flexGrow: 1,
                padding: '12px 16px',
                borderRadius: 24,
                border: '1px solid #d1d5db',
                background: isBlocked ? '#f3f4f6' : 'white',
                fontSize: '1rem',
                outline: 'none',
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
              disabled={sending || (!inputText.trim() && mediaFiles.length === 0)}
              style={{ background: (inputText.trim() || mediaFiles.length > 0) ? '#16a34a' : '#9ca3af', color: 'white', border: 'none', width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (inputText.trim() || mediaFiles.length > 0) ? 'pointer' : 'default', transition: 'background 0.2s', flexShrink: 0 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        )}
      </footer>

      {showCamera && (
        <CameraCapture
          facingMode="environment"
          onClose={() => setShowCamera(false)}
          onCapture={({ file }) => {
            setShowCamera(false)
            const reader = new FileReader()
            reader.onload = (ev) => setCropSrc(ev.target?.result as string)
            reader.readAsDataURL(file)
          }}
        />
      )}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspectRatio={1}
          onCancel={() => setCropSrc(null)}
          onCrop={(file) => {
            setCropSrc(null)
            addFile(file)
          }}
        />
      )}

      {/* Offer Modal */}
      {showOfferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowOfferModal(false)}>
          <div style={{ background: 'white', width: '100%', maxWidth: 500, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Select Product to Offer</h3>
              <button onClick={() => setShowOfferModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {myProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6b7280' }}>
                <span style={{ fontSize: 40 }}>🏪</span>
                <p>You don't have any active products to offer.</p>
                <Link href="/market" style={{ color: '#16a34a', fontWeight: 'bold' }}>Open a Booth to start selling</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {myProducts.map(p => (
                  <button key={p.id} onClick={() => sendOffer(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: 'white', cursor: 'pointer', textAlign: 'left' }}>
                    <img src={p.photos?.[0] || '/placeholder.png'} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{p.name}</div>
                      <div style={{ color: '#16a34a', fontWeight: 'bold' }}>${p.price_usd} / {p.unit}</div>
                    </div>
                    <div style={{ color: '#16a34a', fontWeight: 'bold' }}>Send →</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
