'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'

export default function NewMessageTrafficCop() {
  return (
    <Suspense fallback={
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div className="spinner" style={{ width: 32, height: 32, border: '3px solid #f3f4f6', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ marginTop: 16, color: '#6b7280' }}>Loading...</p>
      </div>
    }>
      <NewMessageTrafficCopInner />
    </Suspense>
  )
}

function NewMessageTrafficCopInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    const targetUserId = searchParams.get('userId')
    if (!targetUserId) {
      router.replace('/messages')
      return
    }

    if (targetUserId === '00000000-0000-0000-0000-000000000000') {
      setError("System Bot does not currently accept Direct Messages.")
      return
    }

    if (targetUserId === user.id) {
      router.replace('/messages')
      return
    }

    const initConversation = async () => {
      const supabase = createClient()
      const productId = searchParams.get('productId')

      // Normalize participant order to avoid duplicate conversations
      const [pA, pB] = [user.id, targetUserId].sort()

      // 1. Check if a conversation already exists between these two users (either direction)
      const { data: existing, error: fetchError } = await supabase
        .from('market_conversations')
        .select('id')
        .or(`and(participant_a.eq.${user.id},participant_b.eq.${targetUserId}),and(participant_a.eq.${targetUserId},participant_b.eq.${user.id})`)
        .maybeSingle()

      if (fetchError) {
        console.error("Failed to check conversation:", fetchError)
        setError("Failed to initialize conversation.")
        return
      }

      if (existing) {
        // Conversation exists! Route directly to it.
        router.replace(`/messages/${existing.id}${productId ? `?productId=${productId}` : ''}`)
        return
      }

      // 2. No conversation exists. Create one with normalized participant order.
      const { data: newConv, error: insertError } = await supabase
        .from('market_conversations')
        .insert({
          participant_a: pA,
          participant_b: pB,
        })
        .select('id')
        .single()

      if (insertError) {
        // Retry: conversation may have been created concurrently (race condition)
        console.warn("Insert failed, retrying lookup:", insertError)
        const { data: retryConv } = await supabase
          .from('market_conversations')
          .select('id')
          .or(`and(participant_a.eq.${user.id},participant_b.eq.${targetUserId}),and(participant_a.eq.${targetUserId},participant_b.eq.${user.id})`)
          .maybeSingle()
        
        if (retryConv) {
          router.replace(`/messages/${retryConv.id}${productId ? `?productId=${productId}` : ''}`)
          return
        }
        
        console.error("Failed to create conversation:", JSON.stringify(insertError))
        setError("Failed to create conversation. Please try again.")
        return
      }

      if (newConv) {
        router.replace(`/messages/${newConv.id}${productId ? `?productId=${productId}` : ''}`)
      }
    }

    initConversation()
  }, [user, authLoading, searchParams, router])

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Could not start chat</h2>
        <p>{error}</p>
        <button 
          onClick={() => router.push('/market')}
          style={{ marginTop: 16, padding: '8px 16px', borderRadius: 20, background: '#166534', color: 'white', border: 'none' }}
        >
          Return to Market
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div className="spinner" style={{ 
        width: 32, height: 32, border: '3px solid #f3f4f6', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite' 
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ marginTop: 16, color: '#6b7280' }}>Initializing secure chat...</p>
    </div>
  )
}
