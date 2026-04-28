'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../lib/supabase'
import { useErrorToast } from './ErrorToast'

/**
 * RatingReminder — Uber-style floating rating prompt
 *
 * On mount, checks for the user's most recent completed order that hasn't been rated.
 * Shows a bottom-anchored card with star rating (1-5) and skip button.
 * Automatically dismissed after rating or skipping.
 */
export function RatingReminder() {
  const [order, setOrder] = useState<{
    id: string
    product_name: string
    counterparty_name: string
    role: 'buyer' | 'seller'
  } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hoverStar, setHoverStar] = useState(0)
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingReview, setRatingReview] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const { showError } = useErrorToast()

  // Check for unrated orders once auth is ready
  useEffect(() => {
    const supabase = createClient()

    const check = async (userId: string) => {
      setCurrentUserId(userId)
      // Check dismissed cache (don't show again for 24h after skip)
      const skipUntil = localStorage.getItem(`rating_skip_until_${userId}`)
      if (skipUntil && new Date(skipUntil) > new Date()) return

      // Skip orders already rated in this browser
      let ratedOrders: string[] = []
      try { ratedOrders = JSON.parse(localStorage.getItem(`casagrown_rated_orders_${userId}`) || '[]') } catch {}

      // Find most recent completed order without rating
      // Check as buyer first
      const { data: buyerOrder } = await supabase
        .from('market_orders')
        .select('id, product_name, seller_id')
        .eq('buyer_id', userId)
        .eq('status', 'completed')
        .is('seller_rating', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (buyerOrder && !ratedOrders.includes(buyerOrder.id)) {
        // Get seller name
        const { data: seller } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', buyerOrder.seller_id)
          .single()

        setOrder({
          id: buyerOrder.id,
          product_name: buyerOrder.product_name,
          counterparty_name: seller?.full_name || 'the seller',
          role: 'buyer',
        })
        return
      }

      // Check as seller
      const { data: sellerOrder } = await supabase
        .from('market_orders')
        .select('id, product_name, buyer_id')
        .eq('seller_id', userId)
        .eq('status', 'completed')
        .is('buyer_rating', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sellerOrder && !ratedOrders.includes(sellerOrder.id)) {
        const { data: buyer } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', sellerOrder.buyer_id)
          .single()

        setOrder({
          id: sellerOrder.id,
          product_name: sellerOrder.product_name,
          counterparty_name: buyer?.full_name || 'the buyer',
          role: 'seller',
        })
      }
    }

    // Check immediately if already loaded
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) check(session.user.id)
    })

    // Listen for auth state — fires when session is restored from storage
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) check(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleRate = useCallback(async (stars: number, reviewText?: string) => {
    if (!order || !currentUserId) return
    const supabase = createClient()
    try {
      const { error } = await supabase.rpc('rate_market_order', {
        p_order_id: order.id,
        p_rating: stars,
        p_review: reviewText?.trim() || null
      })
      if (error) {
        console.error('Rating failed:', error)
        showError('Failed to submit rating. Please try again.')
        return
      }
      // Persist to prevent re-prompt after app restart
      try {
        const rated = JSON.parse(localStorage.getItem(`casagrown_rated_orders_${currentUserId}`) || '[]')
        rated.push(order.id)
        localStorage.setItem(`casagrown_rated_orders_${currentUserId}`, JSON.stringify(rated))
      } catch {}
      setSubmitted(true)
    } catch (e) {
      console.error('Rating failed:', e)
      showError('Failed to submit rating. Please try again.')
      return
    }
    setTimeout(() => setDismissed(true), 1500)
  }, [order, currentUserId, showError])

  const handleSkip = useCallback(() => {
    if (!currentUserId) return
    // Don't show again for 24 hours
    const skipUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    localStorage.setItem(`rating_skip_until_${currentUserId}`, skipUntil)
    setDismissed(true)
  }, [currentUserId])

  if (!order || dismissed) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      width: 'calc(100% - 32px)',
      maxWidth: 420,
      animation: 'slideUp 0.4s ease-out',
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; transform: translateX(-50%) translateY(20px); }
        }
      `}</style>
      <div style={{
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: '20px 24px',
        ...(submitted ? { animation: 'fadeOut 0.5s ease-in 1s forwards' } : {}),
      }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <p style={{ color: '#166534', fontWeight: 600, fontSize: 16, margin: 0 }}>
              Thanks for rating!
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>
                  ⭐ Rate your {order.role === 'buyer' ? 'purchase' : 'sale'}
                </p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                  <strong>{order.product_name}</strong> {order.role === 'buyer' ? 'from' : 'to'} {order.counterparty_name}
                </p>
              </div>
              <button
                onClick={handleSkip}
                style={{
                  background: 'none', border: 'none', color: '#9ca3af', fontSize: 18,
                  cursor: 'pointer', padding: '0 4px', lineHeight: 1,
                }}
                title="Skip for now"
              >
                ✕
              </button>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 8, padding: '8px 0',
            }}>
              {[1, 2, 3, 4, 5].map(star => {
                const isActive = hoverStar >= star || (!hoverStar && ratingValue >= star)
                return (
                  <button
                    key={star}
                    onClick={() => setRatingValue(star)}
                    onMouseEnter={() => setHoverStar(star)}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 32, padding: '4px 2px',
                      transform: isActive ? 'scale(1.15)' : 'scale(1)',
                      opacity: isActive ? 1 : 0.35,
                      transition: 'all 0.15s ease',
                      filter: isActive ? 'none' : 'grayscale(0.5)',
                    }}
                    title={`${star} star${star > 1 ? 's' : ''}`}
                  >
                    ⭐
                  </button>
                )
              })}
            </div>

            {ratingValue > 0 && (
              <div style={{ marginTop: 12, animation: 'slideUp 0.2s ease-out' }}>
                <textarea
                  placeholder={ratingValue <= 2 ? "Please tell us what went wrong... (Required)" : "Add a note (optional)"}
                  value={ratingReview}
                  onChange={(e) => setRatingReview(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                    borderRadius: 8, fontSize: 13, minHeight: 60, resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12
                  }}
                />
                <button
                  onClick={() => handleRate(ratingValue, ratingReview)}
                  disabled={ratingValue <= 2 && !ratingReview.trim()}
                  style={{
                    display: 'block', width: '100%', padding: '10px', 
                    background: (ratingValue <= 2 && !ratingReview.trim()) ? '#9ca3af' : 'var(--green-600, #16a34a)',
                    color: 'white', border: 'none', borderRadius: 8, fontWeight: 600,
                    cursor: (ratingValue <= 2 && !ratingReview.trim()) ? 'not-allowed' : 'pointer',
                    marginBottom: 8
                  }}
                >
                  Submit Rating
                </button>
              </div>
            )}

            {!ratingValue && (
              <button
                onClick={handleSkip}
                style={{
                  display: 'block', width: '100%', background: 'none', border: 'none',
                  color: '#9ca3af', fontSize: 13, padding: '8px 0 0', cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Skip for now
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
