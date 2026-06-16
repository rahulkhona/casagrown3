'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { StripeCheckoutModal } from './StripeCheckoutModal'

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
    desc: 'List your inventory on your Facebook page and drive traffic to your stands — reach buyers where they already are.',
    key: 'facebook_sync',
    image: '/images/pro/facebook-sync.png',
  },
  {
    icon: '📦',
    title: 'Guaranteed Sales',
    desc: 'Let buyers pre-purchase and pick up from your farmers market stands and routes — guaranteed purchases and more foot traffic to your stall.',
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
    desc: 'Share your stands with WhatsApp followers and let them pre-purchase before your drop-off dates.',
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
    title: 'Multiple Stands',
    desc: 'Set up stands for different days, routes, and farmers market participation — all from one account.',
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
 * UpgradePrompt — Two-state Pro onboarding: carousel → farm details + features → Stripe.
 */
export function UpgradePrompt({
  feature,
  inline,
}: {
  feature?: string
  inline?: boolean
}) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoError, setPromoError] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)

  // Platform config
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

  // Onboarding state
  const [showForm, setShowForm] = useState(false)
  const [farmForm, setFarmForm] = useState({
    farm_name: '',
    business_type: '',
    business_license: '',
    business_logo_url: '',
    seller_bio: '',
    food_handler_permit: '',
    cottage_food_permit: '',
    insurance_provider: '',
  })
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, boolean>>({
    fb_inventory_sync: true,
    fb_auto_posts: true,
    growbot_messenger: true,
    growbot_dm: true,
    growbot_orders: true,
  })
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Fetch platform settings + promo discount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('platform_settings')
      .select('pro_monthly_price_usd, standard_platform_fee, pro_platform_fee, pro_free_trial_days')
      .limit(1)
      .single()
      .then(({ data }: { data: any }) => {
        if (data) setConfig(data as PlatformConfig)
      })

    if (user) {
      supabase
        .from('user_subscription_discounts')
        .select('discount_pct, duration_months, promo_name')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data) setDiscount(data as PromoDiscount)
        })

      // Pre-populate farm form from existing profile
      supabase
        .from('profiles')
        .select('farm_name, business_type, business_license, business_logo_url, seller_bio, food_handler_permit, cottage_food_permit, insurance_provider')
        .eq('id', user.id)
        .single()
        .then(({ data }: { data: any }) => {
          if (data) {
            setFarmForm((f) => ({
              ...f,
              farm_name: data.farm_name || f.farm_name,
              business_type: data.business_type || f.business_type,
              business_license: data.business_license || f.business_license,
              business_logo_url: data.business_logo_url || f.business_logo_url,
              seller_bio: data.seller_bio || f.seller_bio,
              food_handler_permit: data.food_handler_permit || f.food_handler_permit,
              cottage_food_permit: data.cottage_food_permit || f.cottage_food_permit,
              insurance_provider: data.insurance_provider || f.insurance_provider,
            }))
          }
        })
    }
  }, [user])

  // Manual carousel navigation
  const prevSlide = () => setSlideIndex((i) => (i - 1 + PRO_BENEFITS.length) % PRO_BENEFITS.length)
  const nextSlide = () => setSlideIndex((i) => (i + 1) % PRO_BENEFITS.length)

  // Computed pricing
  const basePrice = config.pro_monthly_price_usd
  const discountedPrice = discount
    ? basePrice * (1 - discount.discount_pct / 100)
    : basePrice
  const savings = discount ? basePrice - discountedPrice : 0
  const standardFeePct = (config.standard_platform_fee * 100).toFixed(0)
  const proFeePct = (config.pro_platform_fee * 100).toFixed(0)
  const trialDays = config.pro_free_trial_days

  const toggleFeature = (key: string) => {
    if (key === 'lower_fees') return // always on
    setSelectedFeatures((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingLogo(true)
    const supabase = createClient()
    const path = `${user.id}/business-logo.${file.name.split('.').pop()}`
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      if (urlData?.publicUrl) setFarmForm((f) => ({ ...f, business_logo_url: urlData.publicUrl }))
    }
    setUploadingLogo(false)
  }

  const handleSubscribe = async () => {
    setLoading(true)
    setPromoError('')
    const supabase = createClient()

    try {
      // Save farm details to profile (best effort)
      if (farmForm.farm_name.trim()) {
        await supabase
          .from('profiles')
          .update({
            farm_name: farmForm.farm_name,
            business_type: farmForm.business_type || null,
            business_license: farmForm.business_license || null,
            business_logo_url: farmForm.business_logo_url || null,
            seller_bio: farmForm.seller_bio || null,
            food_handler_permit: farmForm.food_handler_permit || null,
            cottage_food_permit: farmForm.cottage_food_permit || null,
            insurance_provider: farmForm.insurance_provider || null,
            pro_features_enabled: selectedFeatures,
          })
          .eq('id', user!.id)
      }

      // Open Stripe embedded checkout modal
      setLoading(false)
      setShowCheckout(true)
    } catch (err: any) {
      console.error('[Pro] Exception:', err)
      setPromoError(`Error: ${err.message || 'Something went wrong.'}`)
      setLoading(false)
    }
  }

  const checkoutModal = showCheckout ? (
    <StripeCheckoutModal
      returnPath={window.location.pathname}
      onClose={() => window.location.reload()}
      onComplete={() => window.location.reload()}
    />
  ) : null

  const currentBenefit = PRO_BENEFITS[slideIndex]

  // ─── Carousel View ───
  if (!showForm) {
    return (
      <>
      {checkoutModal}
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
          padding: '14px 20px',
          background: 'var(--green-50)',
          borderBottom: '1px solid var(--green-100)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🚜</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--green-800)' }}>CasaGrown Pro</h3>
          </div>
          <span className="badge badge-green" style={{ fontSize: 11 }}>Upgrade</span>
        </div>

        {feature && (
          <p style={{ margin: 0, padding: '12px 20px 0', fontSize: 14, color: 'var(--gray-600)' }}>
            <strong>{feature}</strong> is a Pro feature. Upgrade to unlock it.
          </p>
        )}

        {/* Carousel */}
        {!inline && (
          <div style={{ padding: '16px 20px 0', position: 'relative' }}>
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
              <div style={{ padding: '12px 0 8px' }}>
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
        )}

        {/* Dot indicators */}
        {!inline && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '4px 0 16px' }}>
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
        )}

        {/* Pricing + CTA */}
        <div style={{
          padding: '16px 20px 20px',
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
          {Number(proFeePct) > 0 && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--gray-400)' }}>
              + {proFeePct}% transaction fee on sales
            </p>
          )}

          {/* Discount badge */}
          {discount && (
            <div style={{
              background: 'var(--green-50)',
              border: '1px solid var(--green-200)',
              borderRadius: 'var(--radius)',
              padding: '8px 12px',
              marginBottom: 12,
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

          {/* CTA */}
          <button
            className="btn btn-primary btn-lg"
            onClick={() => setShowForm(true)}
            style={{ width: '100%' }}
          >
            {trialDays > 0 ? `Start ${trialDays}-day Free Trial` : 'Enable Pro'}
          </button>
        </div>

        {/* Animation keyframes */}
        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateX(20px); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </div>
      </>
    )
  }

  // ─── Onboarding Form ───
  return (
    <>
    {checkoutModal}
    <div
      style={{
        border: '2px solid #059669',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #065f46, #059669)',
          padding: '16px 24px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🚜</span>
          <strong style={{ fontSize: 16 }}>Set Up CasaGrown Pro</strong>
        </div>
        <button
          onClick={() => setShowForm(false)}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ← Back
        </button>
      </div>

      <div style={{ padding: 24, background: 'white' }}>
        {/* Farm Details */}
        <h4 style={{ margin: '0 0 16px', fontSize: 15, color: '#1f2937', fontWeight: 700 }}>
          Farm / Business Details
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Farm / Business Name *</label>
            <input
              style={inputStyle}
              value={farmForm.farm_name}
              onChange={(e) => setFarmForm((f) => ({ ...f, farm_name: e.target.value }))}
              placeholder="Green Acres Farm"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Seller Bio <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>— helps GrowBot answer buyer questions about you</span></label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
              value={farmForm.seller_bio}
              onChange={(e) => setFarmForm((f) => ({ ...f, seller_bio: e.target.value }))}
              placeholder="Tell buyers about your farm — what you grow, your story, growing methods, etc."
            />
          </div>
          <div>
            <label style={labelStyle}>Business Type</label>
            <select
              style={inputStyle}
              value={farmForm.business_type}
              onChange={(e) => setFarmForm((f) => ({ ...f, business_type: e.target.value }))}
            >
              <option value="">Select (optional)</option>
              <option value="sole_proprietor">Sole Proprietor</option>
              <option value="llc">LLC</option>
              <option value="partnership">Partnership</option>
              <option value="corporation">Corporation</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Business License #</label>
            <input
              style={inputStyle}
              value={farmForm.business_license}
              onChange={(e) => setFarmForm((f) => ({ ...f, business_license: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label style={labelStyle}>Food Handler's Permit #</label>
            <input
              style={inputStyle}
              value={farmForm.food_handler_permit}
              onChange={(e) => setFarmForm((f) => ({ ...f, food_handler_permit: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label style={labelStyle}>Cottage Food Permit #</label>
            <input
              style={inputStyle}
              value={farmForm.cottage_food_permit}
              onChange={(e) => setFarmForm((f) => ({ ...f, cottage_food_permit: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label style={labelStyle}>Insurance Provider</label>
            <input
              style={inputStyle}
              value={farmForm.insurance_provider}
              onChange={(e) => setFarmForm((f) => ({ ...f, insurance_provider: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label style={labelStyle}>Business Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
              style={{ fontSize: 13, padding: 6 }}
            />
            {uploadingLogo && <span style={{ fontSize: 12, color: '#6b7280' }}>Uploading...</span>}
            {farmForm.business_logo_url && (
              <img
                src={farmForm.business_logo_url}
                alt="Logo"
                style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginTop: 6 }}
              />
            )}
          </div>
        </div>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 20px' }} />

        {/* Feature Selection */}
        <h4 style={{ margin: '0 0 12px', fontSize: 15, color: '#1f2937', fontWeight: 700 }}>
          Enable Features
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { key: 'fb_inventory_sync', icon: '📘', label: 'Add inventory to your Facebook page' },
            { key: 'fb_auto_posts', icon: '📣', label: 'Automated Facebook posts to announce inventory' },
            { key: 'growbot_messenger', icon: 'growbot', label: 'GrowBot auto-reply on Facebook Messenger' },
            { key: 'growbot_dm', icon: 'growbot', label: 'GrowBot auto-reply on CasaGrown DMs' },
            { key: 'growbot_orders', icon: 'growbot', label: 'GrowBot auto-reply on CasaGrown Orders' },
          ].map((f) => (
            <label
              key={f.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${selectedFeatures[f.key] ? '#bbf7d0' : '#e5e7eb'}`,
                background: selectedFeatures[f.key] ? '#f0fdf4' : '#fafafa',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={selectedFeatures[f.key] ?? false}
                onChange={() => setSelectedFeatures((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                style={{ accentColor: '#22c55e', width: 16, height: 16 }}
              />
              {f.icon === 'growbot' ? (
                <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 18 }}>{f.icon}</span>
              )}
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1f2937' }}>{f.label}</span>
            </label>
          ))}
        </div>

        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 }}>
          📘 Facebook features require connecting your Facebook page — you can do this after subscribing from your profile.
        </p>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 20px' }} />

        {/* Price Summary */}
        <div
          style={{
            background: '#f0fdf4',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 16,
            border: '1px solid #bbf7d0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>
              CasaGrown Pro — Monthly
            </span>
            <div>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>
                ${discountedPrice.toFixed(2)}
              </span>
              {discount && (
                <span
                  style={{
                    fontSize: 14,
                    textDecoration: 'line-through',
                    color: '#9ca3af',
                    marginLeft: 8,
                  }}
                >
                  ${basePrice.toFixed(2)}
                </span>
              )}
              <span style={{ fontSize: 13, color: '#6b7280' }}>/mo</span>
            </div>
          </div>
          {discount && (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#15803d', fontWeight: 500 }}>
              🎉 {discount.discount_pct}% discount applied
              {discount.duration_months ? ` for ${discount.duration_months} months` : ' — forever!'}
            </p>
          )}
          {trialDays > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#15803d' }}>
              ✓ Includes {trialDays}-day free trial — you won't be charged today
            </p>
          )}
        </div>



        {promoError && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
            ⚠️ {promoError}
          </p>
        )}

        {/* Subscribe button */}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 28px',
            borderRadius: 12,
            border: 'none',
            background: loading
              ? '#9ca3af'
              : 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: 'white',
            fontWeight: 700,
            fontSize: 16,
            cursor: loading ? 'wait' : 'pointer',
            boxShadow: loading ? 'none' : '0 8px 20px rgba(34,197,94,0.3)',
            transition: 'all 0.2s',
          }}
        >
          {loading
            ? 'Setting up...'
            : trialDays > 0
              ? `Start ${trialDays}-day Free Trial`
              : `Subscribe — $${discountedPrice.toFixed(2)}/mo`}
        </button>
      </div>
    </div>
    </>
  )
}

// ─── Shared Styles ───
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
  color: '#1f2937',
  background: '#f9fafb',
  outline: 'none',
  boxSizing: 'border-box',
}
