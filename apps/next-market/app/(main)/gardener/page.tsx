'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { ProUpgradePitch } from '../../components/ProUpgradePitch'

/**
 * /gardener — Landing page for professional gardeners / landscapers.
 * Value proposition: Turn your garden routes into income by selling
 * produce from your clients' gardens on CasaGrown.
 *
 * Wizard steps:
 * 1: Marketing pitch + sign up / log in
 * 2: Profile details (name, area, number of client homes)
 * 3: Create first route-based booth
 * 4: Stripe Connect setup
 * 5: Pro upsell (essential for multi-booth / multi-route)
 */

const BENEFITS = [
  { icon: '🏡', title: '40+ Gardens, One Dashboard', desc: 'Aggregate produce from all your client homes into route-based booths. Manage everything from your phone.' },
  { icon: '🚐', title: 'Deliver On Your Routes', desc: "You're already driving to your clients. Sell produce along the way — zero extra logistics or fuel." },
  { icon: '🍅', title: 'Zero Waste, Extra Income', desc: "Your clients' gardens produce more than they can eat. Turn surplus tomatoes, herbs, and fruit into cash." },
  { icon: '💰', title: 'Revenue Share Built In', desc: "Set up profit splits with homeowners, or charge a flat markup. Transparent and fair for everyone." },
  { icon: '📱', title: 'One Booth Per Route', desc: "Create 'Willow Glen Route' and 'Cambrian Route' booths. Buyers see the products available on their route." },
  { icon: '🤖', title: 'AI Handles the Sales', desc: "GrowBot answers buyer questions 24/7 — product info, availability, and directions. You focus on gardening." },
]

const STEPS = ['Welcome', 'Your Details', 'First Route', 'Get Paid', 'Go Pro']

export default function GardenerLandingPage() {
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
  const [clientCount, setClientCount] = useState('')

  // Step 3: First route booth
  const [routeName, setRouteName] = useState('')
  const [routeAreas, setRouteAreas] = useState('')
  const [offersPickup, setOffersPickup] = useState(true)
  const [offersDelivery, setOffersDelivery] = useState(true)
  const [pickupAddress, setPickupAddress] = useState('')

  // Step 0: Marketing landing
  if (step === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a2f 0%, #065f46 40%, #047857 100%)',
          borderRadius: 24, padding: '40px 24px', color: 'white',
          textAlign: 'center', marginBottom: 32,
          boxShadow: '0 8px 32px rgba(5, 150, 105, 0.25)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🌿</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Turn Your Garden Routes<br />Into Income
          </h1>
          <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, opacity: 1 }}>
            For Professional Gardeners & Landscapers
          </p>
          <p style={{ margin: '0 0 24px', fontSize: 15, opacity: 0.85, lineHeight: 1.6 }}>
            Your clients' gardens produce more than they can eat.
            <br />Sell the surplus to neighbors — along your existing routes.
          </p>
          <button
            onClick={() => {
              if (isAuthenticated) setStep(1)
              else router.push('/auth?redirect=/gardener&step=1')
            }}
            style={{
              padding: '14px 36px', borderRadius: 12, border: 'none',
              background: 'white', color: '#065f46', fontSize: 17,
              fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            🌿 Start Earning — It's Free
          </button>
        </div>

        {/* Key Stat */}
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          borderRadius: 16, padding: '20px 24px', marginBottom: 24,
          border: '1px solid #86efac', textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#065f46' }}>
            40 client homes × $10/week average
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600, color: '#047857' }}>
            = $400/week in extra income on top of your gardening fees
          </p>
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
              { num: '1', text: 'Sign up and create a booth for each route or area you serve' },
              { num: '2', text: 'Photograph and list produce from your clients\' gardens' },
              { num: '3', text: 'Buyers in each area see what\'s available and place orders' },
              { num: '4', text: 'Deliver on your next visit — or set up a pickup point on your route' },
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

        {/* Testimonial-style callout */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px 24px',
          border: '1px solid #e5e7eb', marginBottom: 32,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <p style={{ margin: 0, fontSize: 15, fontStyle: 'italic', color: '#374151', lineHeight: 1.6 }}>
            "My clients love it — they get cash for produce they'd otherwise compost,
            and I earn extra income on routes I'm already driving."
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#059669' }}>
            — The kind of thing your future self will say 🌱
          </p>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => {
              if (isAuthenticated) setStep(1)
              else router.push('/auth?redirect=/gardener&step=1')
            }}
            style={{
              padding: '14px 36px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}
          >
            Start Selling on Your Routes →
          </button>
          <p style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
            Free to start. Pro plan unlocks multiple routes.
          </p>
        </div>
      </div>
    )
  }

  // Wizard shared styles
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
    const bio = sellerBio || (clientCount
      ? `Professional gardener serving ${clientCount} homes in the ${city || zip} area.`
      : null)
    const { error: err } = await supabase.from('profiles').update({
      full_name: fullName, phone_number: phone || null,
      zip_code: zip, street_address: streetAddress,
      city, state_code: stateCode, seller_bio: bio,
    }).eq('id', user!.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setStep(2)
  }

  const handleCreateBooth = async () => {
    if (!routeName.trim()) { setError('Route name is required'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('market_booths').insert({
      owner_id: user!.id,
      name: routeName,
      offers_pickup: offersPickup,
      offers_delivery: offersDelivery,
      pickup_address: pickupAddress || streetAddress,
      is_default: true, is_open: true,
      bot_instructions: routeAreas
        ? `This booth serves the ${routeAreas} area. Products come from client gardens along this route.`
        : null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setStep(3)
  }

  const handleStripeConnect = async () => {
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('stripe-connect-onboard', {
        body: { return_url: `${window.location.origin}/gardener?step=4` },
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
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>About you & your business</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280' }}>
            This helps buyers trust who's growing their food.
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
              <label style={labelStyle}>City</label>
              <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="San Jose" />
            </div>
            <div>
              <label style={labelStyle}>Street Address</label>
              <input style={inputStyle} value={streetAddress} onChange={e => setStreetAddress(e.target.value)} placeholder="1168 Lincoln Ave" />
            </div>
            <div>
              <label style={labelStyle}>How many client homes do you serve?</label>
              <input style={inputStyle} type="number" value={clientCount} onChange={e => setClientCount(e.target.value)}
                placeholder="e.g., 40" />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Helps us understand your scale</span>
            </div>
            <div>
              <label style={labelStyle}>About Your Gardening Business</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }}
                value={sellerBio} onChange={e => setSellerBio(e.target.value)}
                placeholder="What areas do you serve? What kind of gardens do you maintain? How do you grow (organic, no-spray, etc.)?"
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

      {/* Step 2: Create First Route Booth */}
      {step === 2 && (
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Create your first route</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280' }}>
            Each route becomes a booth. You can add more routes later with Pro.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Route / Booth Name *</label>
              <input style={inputStyle} value={routeName} onChange={e => setRouteName(e.target.value)}
                placeholder="e.g., GreenThumb Willow Glen" />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                Name it after your area or route — buyers will see this
              </span>
            </div>
            <div>
              <label style={labelStyle}>Areas / Neighborhoods Covered</label>
              <input style={inputStyle} value={routeAreas} onChange={e => setRouteAreas(e.target.value)}
                placeholder="e.g., Willow Glen, Rose Garden, Naglee Park" />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                Helps buyers know if you serve their area
              </span>
            </div>
            <div>
              <label style={labelStyle}>Fulfillment Options</label>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={offersPickup} onChange={e => setOffersPickup(e.target.checked)} />
                  📍 Pickup (at a client's home or meetup spot)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={offersDelivery} onChange={e => setOffersDelivery(e.target.checked)} />
                  🚐 Delivery (along your route)
                </label>
              </div>
            </div>
            {offersPickup && (
              <div>
                <label style={labelStyle}>Pickup Point Address</label>
                <input style={inputStyle} value={pickupAddress} onChange={e => setPickupAddress(e.target.value)}
                  placeholder="e.g., Corner of Lincoln & Willow St" />
              </div>
            )}
            <button onClick={handleCreateBooth} disabled={saving} style={{
              padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Creating...' : '🚐 Create Route →'}
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
              Your first route is live!
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
              Start adding products from your clients' gardens to get your first sale!
            </p>
            <button onClick={() => router.push('/my-stands')} style={{
              padding: '14px 32px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}>
              🌿 Go to My Routes
            </button>
          </div>

          {/* Pro Upsell — essential for gardening pros */}
          <div style={{
            background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
            borderRadius: 16, padding: '20px', marginBottom: 16,
            border: '1px solid #fcd34d',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#92400e' }}>
              ⚡ Pro is essential for gardening businesses
            </p>
            <p style={{ margin: '0 0 0', fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
              You'll need multiple booths for different routes and areas.
              Free accounts are limited to one booth. Go Pro to unlock unlimited routes,
              Facebook catalog sync, and AI-powered Messenger replies.
            </p>
          </div>

          <div style={{ marginTop: 8 }}>
            <ProUpgradePitch />
          </div>
        </div>
      )}
    </div>
  )
}
