'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../lib/supabase'
import { StripeCheckoutModal } from './StripeCheckoutModal'

/**
 * ProUpgradePitch — A visually compelling slideshow/carousel pitch
 * for upgrading to CasaGrown Pro. Shown on the booth management page
 * for non-Pro users with greyed-out Pro features.
 */

const SLIDES = [
  {
    icon: '📦',
    title: 'Product Catalog',
    description: 'Create once, list everywhere. Manage your master inventory across all booths from a single catalog.',
    gradient: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
  },
  {
    icon: '🏪',
    title: 'Multiple Booths',
    description: 'Run separate booths for different markets. Saturday at the farmers market, Tuesday at the farm stand.',
    gradient: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  },
  {
    icon: '📍',
    title: 'Multiple Pickup Locations',
    description: 'Offer different pickup spots on different days. Customers choose the location and time that works for them.',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
  },
  {
    icon: '🚗',
    title: 'Multiple Delivery Routes',
    description: 'Set up separate delivery zones for different days. Maximize your reach without the logistics headache.',
    gradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  },
  {
    icon: '📱',
    title: 'Facebook Page Catalog',
    description: 'Automatically sync your products to your Facebook Business Page. Buyers discover you while browsing your page.',
    gradient: 'linear-gradient(135deg, #1877F2 0%, #42a5f5 100%)',
  },
  {
    icon: '🤖',
    title: 'Auto-Answer Messages',
    description: 'AI-powered GrowBot answers customer questions 24/7 on Facebook Messenger, DMs, and order chats. Never miss a sale.',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
  },
  {
    icon: '🛒',
    title: 'Pre-Sell for Farmers Market',
    description: 'Take orders before market day. Customers pick up at your booth — you sell out before you arrive.',
    gradient: 'linear-gradient(135deg, #9333ea 0%, #c084fc 100%)',
  },
  {
    icon: '💰',
    title: 'Lower Platform Fees',
    description: '5% vs 10% on every sale. Pro pays for itself with just a few orders per month.',
    gradient: 'linear-gradient(135deg, #15803d 0%, #4ade80 100%)',
  },
]

export function ProUpgradePitch({ compact }: { compact?: boolean }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const [loading, setLoading] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoError, setPromoError] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)

  // Auto-advance slides
  useEffect(() => {
    if (!isAutoPlaying) return
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % SLIDES.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [isAutoPlaying])

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index)
    setIsAutoPlaying(false)
    // Resume auto-play after 10s of inactivity
    setTimeout(() => setIsAutoPlaying(true), 10000)
  }, [])

  const nextSlide = useCallback(() => {
    goToSlide((currentSlide + 1) % SLIDES.length)
  }, [currentSlide, goToSlide])

  const prevSlide = useCallback(() => {
    goToSlide((currentSlide - 1 + SLIDES.length) % SLIDES.length)
  }, [currentSlide, goToSlide])

  const handleUpgrade = async () => {
    setLoading(true)
    setPromoError('')
    const supabase = createClient()
    const { data, error } = await supabase.functions.invoke('create-pro-checkout', {
      body: { promo_code: promoCode || undefined, return_path: window.location.pathname },
    })
    if (error || !data?.clientSecret) {
      setPromoError(data?.error || error?.message || 'Failed to start checkout')
      setLoading(false)
      return
    }
    setLoading(false)
    setShowCheckout(true)
  }

  const slide = SLIDES[currentSlide]

  return (
    <>
    <div style={{
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      background: '#fff',
      border: '1px solid var(--gray-200, #e5e7eb)',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)',
        padding: '20px 24px',
        color: 'white',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>🚜</span>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            CasaGrown Pro
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
          Everything you need to grow your farm business
        </p>
      </div>

      {/* Slideshow */}
      <div style={{ position: 'relative' }}>
        {/* Slide Content */}
        <div
          style={{
            background: slide.gradient,
            padding: compact ? '24px 20px' : '32px 24px',
            color: 'white',
            minHeight: compact ? 140 : 160,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            transition: 'background 0.5s ease',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <span style={{
              fontSize: 40,
              display: 'block',
              marginBottom: 12,
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))',
            }}>
              {slide.icon}
            </span>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: compact ? 18 : 20,
              fontWeight: 700,
              textShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
              {slide.title}
            </h3>
            <p style={{
              margin: 0,
              fontSize: compact ? 13 : 14,
              opacity: 0.95,
              lineHeight: 1.5,
              maxWidth: 360,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}>
              {slide.description}
            </p>
          </div>
        </div>

        {/* Nav Arrows */}
        <button
          onClick={prevSlide}
          aria-label="Previous slide"
          style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'white', fontSize: 16, backdropFilter: 'blur(4px)',
          }}
        >
          ‹
        </button>
        <button
          onClick={nextSlide}
          aria-label="Next slide"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'white', fontSize: 16, backdropFilter: 'blur(4px)',
          }}
        >
          ›
        </button>
      </div>

      {/* Dot indicators */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 6,
        padding: '12px 0 4px',
        background: '#fff',
      }}>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goToSlide(i)}
            aria-label={`Go to slide ${i + 1}`}
            style={{
              width: i === currentSlide ? 20 : 8,
              height: 8,
              borderRadius: 4,
              border: 'none',
              background: i === currentSlide ? '#059669' : '#d1d5db',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* CTA Section */}
      <div style={{
        padding: '16px 24px 24px',
        background: '#fff',
        textAlign: 'center',
      }}>
        {/* Price */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#065f46' }}>$10</span>
          <span style={{ fontSize: 14, color: '#6b7280', marginLeft: 4 }}>/month</span>
          <div style={{
            display: 'inline-block',
            marginLeft: 12,
            padding: '3px 10px',
            borderRadius: 12,
            background: '#ecfdf5',
            color: '#059669',
            fontSize: 12,
            fontWeight: 600,
          }}>
            14-day free trial
          </div>
        </div>

        {/* Promo + CTA */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          justifyContent: 'center', flexWrap: 'wrap',
        }}>
          <input
            type="text"
            placeholder="Promo code"
            value={promoCode}
            onChange={e => setPromoCode(e.target.value.toUpperCase())}
            style={{
              padding: '10px 14px', borderRadius: 10,
              border: '1px solid #d1d5db', fontSize: 14,
              width: 120, outline: 'none', textAlign: 'center',
              background: '#f9fafb',
            }}
          />
          <button
            onClick={handleUpgrade}
            disabled={loading}
            id="pro-upgrade-btn"
            style={{
              padding: '12px 28px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
              color: 'white', fontWeight: 700, fontSize: 15,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={e => {
              if (!loading) {
                ;(e.target as HTMLButtonElement).style.transform = 'translateY(-1px)'
                ;(e.target as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(5, 150, 105, 0.4)'
              }
            }}
            onMouseLeave={e => {
              ;(e.target as HTMLButtonElement).style.transform = 'translateY(0)'
              ;(e.target as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.3)'
            }}
          >
            {loading ? 'Starting...' : '🌱 Start Free Trial'}
          </button>
        </div>
        {promoError && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#ef4444' }}>
            ⚠️ {promoError}
          </p>
        )}
      </div>
    </div>

    {showCheckout && (
      <StripeCheckoutModal
        returnPath={window.location.pathname}
        onClose={() => window.location.reload()}
        onComplete={() => window.location.reload()}
      />
    )}
    </>
  )
}
