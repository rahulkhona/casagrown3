'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../lib/supabase'

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
  const [hoverStar, setHoverStar] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Check for unrated orders on mount
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check dismissed cache (don't show again for 24h after skip)
      const skipUntil = localStorage.getItem('rating_skip_until')
      if (skipUntil && new Date(skipUntil) > new Date()) return

      // Find most recent completed order without rating
      // Check as buyer first
      const { data: buyerOrder } = await supabase
        .from('market_orders')
        .select('id, product_name, seller_id')
        .eq('buyer_id', user.id)
        .eq('status', 'completed')
        .is('buyer_rating', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (buyerOrder) {
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
        .eq('seller_id', user.id)
        .eq('status', 'completed')
        .is('seller_rating', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sellerOrder) {
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
    check()
  }, [])

  const handleRate = useCallback(async (stars: number) => {
    if (!order) return
    setSubmitted(true)
    const supabase = createClient()
    try {
      await supabase.rpc('rate_market_order', {
        p_order_id: order.id,
        p_rating: stars,
      })
    } catch (e) {
      console.error('Rating failed:', e)
    }
    setTimeout(() => setDismissed(true), 1500)
  }, [order])

  const handleSkip = useCallback(() => {
    // Don't show again for 24 hours
    const skipUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    localStorage.setItem('rating_skip_until', skipUntil)
    setDismissed(true)
  }, [])

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
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => handleRate(star)}
                  onMouseEnter={() => setHoverStar(star)}
                  onMouseLeave={() => setHoverStar(0)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 32, padding: '4px 2px',
                    transform: (hoverStar >= star) ? 'scale(1.2)' : 'scale(1)',
                    opacity: (hoverStar >= star) ? 1 : 0.35,
                    transition: 'all 0.15s ease',
                    filter: (hoverStar >= star) ? 'none' : 'grayscale(0.5)',
                  }}
                  title={`${star} star${star > 1 ? 's' : ''}`}
                >
                  ⭐
                </button>
              ))}
            </div>
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
          </>
        )}
      </div>
    </div>
  )
}
