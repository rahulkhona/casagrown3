'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

const PRO_BENEFITS = [
  {
    icon: '🚜',
    title: 'Who is Pro for?',
    desc: 'Built for small local farmers and gardening service providers who want to grow their business, reach more buyers, and sell smarter.',
    key: 'intro',
    image: '/images/pro/intro.png',
  },
  {
    icon: '📘',
    title: 'Reach More Buyers',
    desc: 'List your inventory on your Facebook page and drive traffic to your booths — reach buyers where they already are.',
    key: 'facebook_sync',
    image: '/images/pro/facebook-sync.png',
  },
  {
    icon: '📦',
    title: 'Guaranteed Sales',
    desc: 'Let buyers pre-purchase and pick up from your farmers market booths and routes — guaranteed purchases and more foot traffic to your stall.',
    key: 'preorders',
    image: '/images/pro/preorders.png',
  },
  {
    icon: 'growbot',
    title: 'Never Miss a Sale',
    desc: 'GrowBot answers your Facebook Messenger and CasaGrown DMs while you\'re away — and enables pre-purchases right from Facebook Marketplace, something sellers can\'t do today.',
    key: 'growbot_ai',
    image: '/images/pro/growbot-ai.png',
  },
  {
    icon: '📱',
    title: 'Engage Your Followers',
    desc: 'Share your booths with WhatsApp followers and let them pre-purchase before your drop-off dates.',
    key: 'whatsapp_sharing',
    image: '/images/pro/whatsapp-sharing.png',
  },
  {
    icon: '🌱',
    title: 'Earn Extra Income',
    desc: 'Gardening service providers — help your homeowners sell their excess produce on CasaGrown and earn more.',
    key: 'gardening_services',
    image: '/images/pro/gardening-service.png',
  },
  {
    icon: '🏪',
    title: 'Sell Everywhere',
    desc: 'Set up separate booths for each farmers market, neighborhood route, or drop-off day — manage everything from one account.',
    key: 'multiple_booths',
    image: '/images/pro/multiple-booths.png',
  },
]

type PlatformConfig = {
  pro_monthly_price_usd: number
  standard_platform_fee: number
  pro_platform_fee: number
  pro_free_trial_days: number
}

type PromoDiscount = {
  discount_pct: number
  duration_months: number | null
  promo_name: string | null
}

/**
 * ProCarousel — Standalone Pro benefits carousel (no CTA / checkout).
 * Use `showPricing` to display pricing info below the carousel.
 * Use `compact` for a tighter layout variant.
 */
export function ProCarousel({
  compact,
  showPricing,
}: {
  compact?: boolean
  showPricing?: boolean
}) {
  const { user } = useAuth()

  // Platform config (only fetched when showPricing is true)
  const [config, setConfig] = useState<PlatformConfig>({
    pro_monthly_price_usd: 10,
    standard_platform_fee: 0.1,
    pro_platform_fee: 0.02,
    pro_free_trial_days: 0,
  })

  // Promo discount
  const [discount, setDiscount] = useState<PromoDiscount | null>(null)

  // Carousel
  const [slideIndex, setSlideIndex] = useState(0)

  // Fetch platform settings + promo discount when showPricing is enabled
  useEffect(() => {
    if (!showPricing) return

    const supabase = createClient()
    supabase
      .from('platform_settings')
      .select('pro_monthly_price_usd, standard_platform_fee, pro_platform_fee, pro_free_trial_days')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setConfig(data as PlatformConfig)
      })

    if (user) {
      supabase
        .from('user_subscription_discounts')
        .select('discount_pct, duration_months, promo_name')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
        .then(({ data }) => {
          if (data) setDiscount(data as PromoDiscount)
        })
    }
  }, [showPricing, user])

  // Manual carousel navigation
  const prevSlide = () => setSlideIndex((i) => (i - 1 + PRO_BENEFITS.length) % PRO_BENEFITS.length)
  const nextSlide = () => setSlideIndex((i) => (i + 1) % PRO_BENEFITS.length)

  // Computed pricing
  const basePrice = config.pro_monthly_price_usd
  const discountedPrice = discount
    ? basePrice * (1 - discount.discount_pct / 100)
    : basePrice
  const savings = discount ? basePrice - discountedPrice : 0
  const trialDays = config.pro_free_trial_days

  const currentBenefit = PRO_BENEFITS[slideIndex]

  return (
    <div
      className="card"
      style={{
        border: '1px solid var(--green-200)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: compact ? '10px 16px' : '14px 20px',
        background: 'var(--green-50)',
        borderBottom: '1px solid var(--green-100)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🚜</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--green-800)' }}>CasaGrown Pro</h3>
        </div>
      </div>

      {/* Carousel */}
      <div style={{ padding: compact ? '12px 16px 0' : '16px 20px 0', position: 'relative' }}>
        {/* Left arrow */}
        <button
          type="button"
          onClick={prevSlide}
          style={{
            position: 'absolute', left: 8, top: '38%',
            zIndex: 2, background: 'rgba(255,255,255,0.9)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-full)',
            width: 32, height: 32, display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: 16,
            color: 'var(--gray-600)', boxShadow: 'var(--shadow-sm)',
          }}
        >‹</button>
        {/* Right arrow */}
        <button
          type="button"
          onClick={nextSlide}
          style={{
            position: 'absolute', right: 8, top: '38%',
            zIndex: 2, background: 'rgba(255,255,255,0.9)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-full)',
            width: 32, height: 32, display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: 16,
            color: 'var(--gray-600)', boxShadow: 'var(--shadow-sm)',
          }}
        >›</button>
        <div
          key={slideIndex}
          style={{ animation: 'slideUp 0.4s ease-out' }}
        >
          {/* Benefit image */}
          <div style={{
            position: 'relative',
            width: '100%',
            paddingTop: '56%',
            overflow: 'hidden',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}>
            <img
              src={currentBenefit.image}
              alt={currentBenefit.title}
              style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
          {/* Title + Description */}
          <div style={{ padding: compact ? '8px 0 4px' : '12px 0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {currentBenefit.icon === 'growbot' ? (
                <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 20 }}>{currentBenefit.icon}</span>
              )}
              <strong style={{ fontSize: 15, color: 'var(--gray-800)' }}>{currentBenefit.title}</strong>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.5 }}>
              {currentBenefit.desc}
            </p>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: compact ? '2px 0 12px' : '4px 0 16px' }}>
        {PRO_BENEFITS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSlideIndex(i)}
            style={{
              width: i === slideIndex ? 20 : 8,
              height: 8,
              borderRadius: 4,
              border: 'none',
              background: i === slideIndex ? 'var(--green-500)' : 'var(--gray-200)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Optional pricing section */}
      {showPricing && (
        <div style={{
          padding: compact ? '12px 16px 16px' : '16px 20px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--gray-50)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            {discount && (
              <span className="price-strikethrough" style={{ fontSize: 15 }}>
                ${basePrice.toFixed(2)}
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-700)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Only
            </span>
            <span className="price price-large">
              ${discountedPrice.toFixed(2)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              per month{trialDays > 0 ? ` · ${trialDays}-day free trial` : ''}
            </span>
          </div>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--gray-400)' }}>
            Month-to-month · Cancel anytime · Full refund within the first 7 days
          </p>

          {/* Discount badge */}
          {discount && (
            <div style={{
              background: 'var(--green-50)',
              border: '1px solid var(--green-200)',
              borderRadius: 'var(--radius)',
              padding: '8px 12px',
              marginTop: 8,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--green-700)',
            }}>
              🎉 {discount.discount_pct}% off — saves ${savings.toFixed(2)}/mo
              {discount.promo_name && <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}> via {discount.promo_name}</span>}
              {discount.duration_months
                ? ` for ${discount.duration_months} month${discount.duration_months > 1 ? 's' : ''}`
                : ' forever'}
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
