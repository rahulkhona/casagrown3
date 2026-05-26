'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { ProUpgradePitch } from '../../components/ProUpgradePitch'

/**
 * /farmer — Seller onboarding landing page with wizard flow.
 * Step 1: Marketing pitch + sign up / log in
 * Step 2: Profile details (name, address, phone, bio)
 * Step 3: Create first booth
 * Step 4: Stripe Connect setup
 * Step 5: Pro upsell
 */

const BENEFITS = [
  { icon: '🌱', title: 'Zero Startup Cost', desc: 'Create your booth and start listing for free. No monthly fee required.' },
  { icon: '📱', title: 'Sell From Your Phone', desc: 'Manage orders, chat with buyers, and track earnings — all from your pocket.' },
  { icon: '🏘️', title: 'Reach Your Neighbors', desc: 'Sell to people in your zip code. No shipping needed — just local pickup or delivery.' },
  { icon: '💰', title: 'Get Paid Easily', desc: 'Secure payments through Stripe. Funds deposited directly to your bank account.' },
  { icon: '📦', title: 'Pre-Sell Your Harvest', desc: 'Take orders before market day. Know exactly how much to bring — zero waste.' },
  { icon: '🤖', title: 'AI Sales Assistant', desc: 'GrowBot answers customer questions 24/7 so you never miss a sale.' },
]

const STEPS = ['Welcome', 'Your Details', 'Create Booth', 'Get Paid', 'Go Pro']

export default function FarmerLandingPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 2: Profile details
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [zip, setZip] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [sellerBio, setSellerBio] = useState('')

  // Step 3: Booth setup
  const [boothName, setBoothName] = useState('')
  const [offersPickup, setOffersPickup] = useState(true)
  const [offersDelivery, setOffersDelivery] = useState(false)
  const [pickupAddress, setPickupAddress] = useState('')

  // Step 0: Marketing landing
  if (step === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)',
          borderRadius: 24, padding: '40px 24px', color: 'white',
          textAlign: 'center', marginBottom: 32,
          boxShadow: '0 8px 32px rgba(5, 150, 105, 0.25)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🚜</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Sell Your Fresh Produce
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 16, opacity: 0.9, lineHeight: 1.6 }}>
            Turn your garden, farm, or kitchen into a local business.
            <br />Join CasaGrown and start selling to your neighbors today.
          </p>
          <button
            onClick={() => {
              if (isAuthenticated) {
                setStep(1)
              } else {
                router.push('/auth?redirect=/farmer&step=1')
              }
            }}
            style={{
              padding: '14px 36px', borderRadius: 12, border: 'none',
              background: 'white', color: '#065f46', fontSize: 17,
              fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'transform 0.2s',
            }}
          >
            🌱 Get Started — It's Free
          </button>
        </div>

        {/* Benefits Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16, marginBottom: 32,
        }}>
          {BENEFITS.map(b => (
            <div key={b.title} style={{
              background: '#fff', borderRadius: 16, padding: '20px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{b.icon}</div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                {b.title}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div style={{
          background: '#f9fafb', borderRadius: 16, padding: '24px',
          border: '1px solid #e5e7eb', marginBottom: 32,
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
            How It Works
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { num: '1', text: 'Create your free account and set up your booth' },
              { num: '2', text: 'List your products with photos, prices, and descriptions' },
              { num: '3', text: 'Buyers in your area discover and order from you' },
              { num: '4', text: 'Fulfill orders via pickup or delivery — get paid via Stripe' },
            ].map(s => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#059669', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 16, flexShrink: 0,
                }}>{s.num}</div>
                <span style={{ fontSize: 14, color: '#374151' }}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => {
              if (isAuthenticated) setStep(1)
              else router.push('/auth?redirect=/farmer&step=1')
            }}
            style={{
              padding: '14px 36px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}
          >
            Start Selling Today →
          </button>
          <p style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
            Free to start. No credit card required.
          </p>
        </div>
      </div>
    )
  }

  // Steps 1-4: Wizard
  const stepIndicatorStyle = (i: number) => ({
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    fontSize: 12, fontWeight: 700 as const,
    background: i < step ? '#059669' : i === step ? '#065f46' : '#e5e7eb',
    color: i <= step ? 'white' : '#9ca3af',
    transition: 'all 0.3s',
  })

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
    boxSizing: 'border-box' as const, background: '#f9fafb',
  }

  const labelStyle = {
    display: 'block' as const, fontSize: 13, fontWeight: 600 as const,
    color: '#374151', marginBottom: 4,
  }

  const handleSaveProfile = async () => {
    if (!fullName.trim()) { setError('Name is required'); return }
    if (!zip.trim()) { setError('Zip code is required'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('profiles').update({
      full_name: fullName, phone_number: phone || null,
      zip_code: zip, street_address: streetAddress,
      city, state_code: stateCode, seller_bio: sellerBio || null,
    }).eq('id', user!.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setStep(2)
  }

  const handleCreateBooth = async () => {
    if (!boothName.trim()) { setError('Booth name is required'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('market_booths').insert({
      owner_id: user!.id, name: boothName,
      offers_pickup: offersPickup, offers_delivery: offersDelivery,
      pickup_address: pickupAddress || streetAddress,
      is_default: true, is_open: true,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setStep(3)
  }

  const handleStripeConnect = async () => {
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('stripe-connect-onboard', {
        body: { return_url: `${window.location.origin}/farmer?step=4` },
      })
      if (err || !data?.url) {
        setError('Failed to start Stripe setup. You can do this later from your profile.')
        setSaving(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Failed to connect to Stripe. You can set this up later.')
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
      {/* Step Indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, marginBottom: 32,
      }}>
        {STEPS.slice(1).map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={stepIndicatorStyle(i + 1)}>
              {i + 1 < step ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 2 && (
              <div style={{
                width: 24, height: 2,
                background: i + 1 < step ? '#059669' : '#e5e7eb',
                borderRadius: 1,
              }} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: '#fef2f2', color: '#dc2626', fontSize: 13,
          border: '1px solid #fecaca',
        }}>⚠️ {error}</div>
      )}

      {/* Step 1: Profile Details */}
      {step === 1 && (
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Tell us about yourself</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280' }}>
            This helps buyers know who they're buying from.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input style={inputStyle} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (408) 555-1234" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Zip Code *</label>
                <input style={inputStyle} value={zip} onChange={e => setZip(e.target.value)} placeholder="95125" />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input style={inputStyle} value={stateCode} onChange={e => setStateCode(e.target.value.toUpperCase())} placeholder="CA" maxLength={2} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Street Address</label>
              <input style={inputStyle} value={streetAddress} onChange={e => setStreetAddress(e.target.value)} placeholder="1168 Lincoln Ave" />
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="San Jose" />
            </div>
            <div>
              <label style={labelStyle}>About Your Farm / Business</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }}
                value={sellerBio} onChange={e => setSellerBio(e.target.value)}
                placeholder="Tell buyers about your growing practices, what makes your produce special, etc."
              />
            </div>
            <button onClick={handleSaveProfile} disabled={saving} style={{
              padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Create Booth */}
      {step === 2 && (
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Set up your booth</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280' }}>
            Your booth is where buyers browse and order your products.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Booth Name *</label>
              <input style={inputStyle} value={boothName} onChange={e => setBoothName(e.target.value)}
                placeholder="e.g., Sarah's Garden Fresh" />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>This is what buyers see on the market</span>
            </div>
            <div>
              <label style={labelStyle}>Fulfillment Options</label>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={offersPickup} onChange={e => setOffersPickup(e.target.checked)} />
                  📍 Pickup
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={offersDelivery} onChange={e => setOffersDelivery(e.target.checked)} />
                  🚗 Delivery
                </label>
              </div>
            </div>
            {offersPickup && (
              <div>
                <label style={labelStyle}>Pickup Address</label>
                <input style={inputStyle} value={pickupAddress} onChange={e => setPickupAddress(e.target.value)}
                  placeholder="Same as home address if blank" />
              </div>
            )}
            <button onClick={handleCreateBooth} disabled={saving} style={{
              padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Creating...' : '🏪 Create Booth →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Stripe Connect */}
      {step === 3 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>💳</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Set up payments</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
            Connect your bank account via Stripe so you can accept payments
            and receive payouts. This takes about 2 minutes.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
            <button onClick={handleStripeConnect} disabled={saving} style={{
              padding: '14px', borderRadius: 12, border: 'none',
              background: '#635bff', color: 'white', fontSize: 15,
              fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: '0 4px 12px rgba(99, 91, 255, 0.3)',
            }}>
              {saving ? 'Connecting...' : '🔗 Connect with Stripe'}
            </button>
            <button onClick={() => setStep(4)} style={{
              padding: '12px', borderRadius: 12, border: '1px solid #e5e7eb',
              background: 'transparent', color: '#6b7280', fontSize: 14,
              cursor: 'pointer',
            }}>
              Skip for now — I'll do this later
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Pro Upsell + Finish */}
      {step === 4 && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>
              You're all set!
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
              Your booth is live. Start adding products to get your first sale!
            </p>
            <button onClick={() => router.push('/my-stands')} style={{
              padding: '14px 32px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}>
              🌱 Go to My Booths
            </button>
          </div>

          {/* Pro Upsell */}
          <div style={{ marginTop: 32 }}>
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              Ready to take your business to the next level?
            </p>
            <ProUpgradePitchInline />
          </div>
        </div>
      )}
    </div>
  )
}

/** Inline version of the Pro pitch for the wizard */
function ProUpgradePitchInline() {
  return <ProUpgradePitch />
}
