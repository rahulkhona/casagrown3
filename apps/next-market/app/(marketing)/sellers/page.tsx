'use client'

import Link from 'next/link'
import { useMarketingAnalytics, trackEvent } from '@/lib/crm-analytics'

export default function SellersPage() {
  useMarketingAnalytics('/sellers')

  return (
    <div className="marketing-root">
      <nav className="marketing-nav">
        <Link href="/" className="marketing-logo">🌱 CasaGrown</Link>
        <div className="marketing-nav-links">
          <Link href="/market">Browse Market</Link>
          <Link href="/join" className="marketing-nav-cta"
            onClick={() => trackEvent('cta_clicked', '/sellers', { button: 'nav-join' })}>
            Start Selling Free
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="marketing-hero sellers-hero">
        <div className="marketing-hero-content">
          <div className="marketing-hero-badge">💰 Turn Your Garden Into Income</div>
          <h1 className="marketing-hero-title">
            Earn Money From<br />
            <span className="marketing-hero-gradient">Your Backyard</span>
          </h1>
          <p className="marketing-hero-subtitle">
            Sell fresh produce, eggs, honey, herbs and more to neighbors
            in your community. No subscription fees. Keep up to 97% of every sale.
          </p>
          <div className="marketing-hero-actions">
            <Link
              href="/join?intent=seller"
              className="marketing-btn-primary"
              onClick={() => trackEvent('cta_clicked', '/sellers', { button: 'hero-start-selling' })}
            >
              Start Selling Today →
            </Link>
            <Link href="/market" className="marketing-btn-secondary">
              See What Sells
            </Link>
          </div>
        </div>
        <div className="sellers-earnings-card">
          <div className="earnings-card-header">💵 Seller Earnings Example</div>
          <div className="earnings-rows">
            {[
              { item: 'Tomatoes (5 lbs/week)', price: '$12', monthly: '$48' },
              { item: 'Eggs (2 dozen/week)', price: '$8', monthly: '$32' },
              { item: 'Fresh Basil bundles', price: '$5', monthly: '$20' },
              { item: 'Jalapeños (1 bag/week)', price: '$4', monthly: '$16' },
            ].map((r, i) => (
              <div key={i} className="earnings-row">
                <span className="earnings-item">{r.item}</span>
                <span className="earnings-price">{r.price}</span>
                <span className="earnings-monthly">{r.monthly}/mo</span>
              </div>
            ))}
            <div className="earnings-total">
              <span>Monthly Total</span>
              <span className="earnings-total-value">~$116</span>
            </div>
          </div>
          <p className="earnings-note">Real neighborhood sellers earning real income</p>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────── */}
      <section className="marketing-section">
        <h2 className="marketing-section-title">Why Sell on CasaGrown?</h2>
        <div className="marketing-steps">
          {[
            { icon: '🚫', title: 'Zero Listing Fees', desc: 'List as many products as you want for free. No monthly subscription. Pay only a small platform fee when you make a sale.' },
            { icon: '📱', title: 'Easy Mobile App', desc: 'Manage your booth, update inventory, and chat with buyers — all from your phone in minutes.' },
            { icon: '🏘️', title: 'Hyper-Local Buyers', desc: 'Your neighbors are already looking for fresh local produce. No shipping, no strangers — just community.' },
            { icon: '💸', title: 'Fast Payouts', desc: 'Get paid via gift card, donation, or direct cashout. Earnings processed weekly.' },
            { icon: '📊', title: 'Sales Analytics', desc: 'See what\'s selling, track your earnings, and know when to plant more of what\'s popular.' },
            { icon: '🔒', title: 'Trusted Community', desc: 'Verified local buyers. Ratings and reviews from real neighbors in your community.' },
          ].map((b, i) => (
            <div key={i} className="marketing-step">
              <div className="marketing-step-icon">{b.icon}</div>
              <h3>{b.title}</h3>
              <p>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What you can sell ────────────────────────────────────── */}
      <section className="marketing-section marketing-section-alt">
        <h2 className="marketing-section-title">What Sellers List</h2>
        <div className="sellers-categories">
          {[
            { emoji: '🍅', label: 'Vegetables' },
            { emoji: '🍓', label: 'Fruits & Berries' },
            { emoji: '🥚', label: 'Eggs & Dairy' },
            { emoji: '🌿', label: 'Fresh Herbs' },
            { emoji: '🍯', label: 'Honey & Preserves' },
            { emoji: '🌱', label: 'Seedlings & Plants' },
            { emoji: '🌾', label: 'Grains & Flours' },
            { emoji: '🧁', label: 'Baked Goods' },
          ].map((c, i) => (
            <div key={i} className="sellers-category">
              <span className="sellers-category-emoji">{c.emoji}</span>
              <span className="sellers-category-label">{c.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="marketing-cta-section">
        <h2>Ready to Turn Your Garden Into Income?</h2>
        <p>It takes 5 minutes to set up your booth. Start earning this week.</p>
        <div className="marketing-cta-actions">
          <Link
            href="/join?intent=seller"
            className="marketing-btn-primary marketing-btn-large"
            onClick={() => trackEvent('cta_clicked', '/sellers', { button: 'bottom-cta' })}
          >
            Create My Seller Booth →
          </Link>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-content">
          <Link href="/" className="marketing-logo">🌱 CasaGrown</Link>
          <div className="marketing-footer-links">
            <Link href="/market">Browse Market</Link>
            <Link href="/">For Buyers</Link>
            <Link href="/join">Join Free</Link>
          </div>
        </div>
        <div className="marketing-footer-bottom">
          <p>© {new Date().getFullYear()} CasaGrown. All rights reserved.</p>
        </div>
      </footer>

      <style jsx>{`
        .marketing-root { min-height: 100vh; background: #0a0f0a; color: #f0faf0; font-family: 'Inter', system-ui, sans-serif; }
        .marketing-nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 48px; position: sticky; top: 0; z-index: 100; background: rgba(10,15,10,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(120,200,100,0.12); }
        .marketing-logo { font-size: 1.4rem; font-weight: 700; color: #7ec85a; text-decoration: none; }
        .marketing-nav-links { display: flex; align-items: center; gap: 32px; }
        .marketing-nav-links a { color: #a0bfa0; text-decoration: none; font-size: 0.95rem; transition: color 0.2s; }
        .marketing-nav-links a:hover { color: #f0faf0; }
        .marketing-nav-cta { background: #4ade80; color: #0a1f0a !important; border-radius: 24px; padding: 8px 20px; font-weight: 600; }
        .marketing-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; padding: 96px 48px; max-width: 1200px; margin: 0 auto; }
        .marketing-hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(120,200,80,0.12); border: 1px solid rgba(120,200,80,0.25); border-radius: 100px; padding: 6px 16px; font-size: 0.85rem; color: #7ec85a; font-weight: 500; margin-bottom: 24px; }
        .marketing-hero-title { font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; line-height: 1.1; margin-bottom: 24px; }
        .marketing-hero-gradient { background: linear-gradient(135deg, #4ade80, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .marketing-hero-subtitle { font-size: 1.15rem; color: #8aac8a; line-height: 1.7; margin-bottom: 36px; }
        .marketing-hero-actions { display: flex; gap: 16px; flex-wrap: wrap; }
        .marketing-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #4ade80, #22c55e); color: #052e16; font-weight: 700; border-radius: 12px; padding: 14px 28px; text-decoration: none; font-size: 1rem; transition: all 0.2s; box-shadow: 0 4px 24px rgba(74,222,128,0.2); }
        .marketing-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(74,222,128,0.3); }
        .marketing-btn-primary.marketing-btn-large { padding: 18px 36px; font-size: 1.1rem; border-radius: 16px; }
        .marketing-btn-secondary { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid rgba(120,200,80,0.3); color: #7ec85a; border-radius: 12px; padding: 14px 28px; text-decoration: none; font-weight: 600; }
        /* Earnings card */
        .sellers-earnings-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(120,200,80,0.2); border-radius: 24px; padding: 32px; }
        .earnings-card-header { font-size: 1rem; font-weight: 600; color: #7ec85a; margin-bottom: 24px; }
        .earnings-rows { display: flex; flex-direction: column; gap: 12px; }
        .earnings-row { display: grid; grid-template-columns: 1fr auto auto; gap: 16px; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(120,200,80,0.08); }
        .earnings-item { color: #c0d8c0; font-size: 0.9rem; }
        .earnings-price { color: #7ec85a; font-weight: 500; }
        .earnings-monthly { color: #4ade80; font-weight: 600; font-size: 0.9rem; }
        .earnings-total { display: flex; justify-content: space-between; padding-top: 16px; font-weight: 700; font-size: 1rem; }
        .earnings-total-value { color: #4ade80; font-size: 1.3rem; }
        .earnings-note { font-size: 0.8rem; color: #6a8c6a; margin-top: 12px; text-align: center; }
        /* Sections */
        .marketing-section { padding: 96px 48px; max-width: 1200px; margin: 0 auto; }
        .marketing-section-alt { background: rgba(120,200,80,0.03); border-radius: 32px; }
        .marketing-section-title { font-size: 2.2rem; font-weight: 700; text-align: center; margin-bottom: 56px; }
        .marketing-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .marketing-step { background: rgba(255,255,255,0.03); border: 1px solid rgba(120,200,80,0.12); border-radius: 24px; padding: 40px 32px; text-align: center; transition: transform 0.2s; }
        .marketing-step:hover { transform: translateY(-4px); }
        .marketing-step-icon { font-size: 2.5rem; margin-bottom: 16px; }
        .marketing-step h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 12px; }
        .marketing-step p { color: #6a8c6a; line-height: 1.6; font-size: 0.95rem; }
        /* Categories */
        .sellers-categories { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .sellers-category { display: flex; flex-direction: column; align-items: center; gap: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(120,200,80,0.12); border-radius: 20px; padding: 32px 16px; transition: all 0.2s; cursor: default; }
        .sellers-category:hover { background: rgba(120,200,80,0.06); border-color: rgba(120,200,80,0.25); transform: translateY(-2px); }
        .sellers-category-emoji { font-size: 2.5rem; }
        .sellers-category-label { color: #a0bfa0; font-size: 0.9rem; font-weight: 500; text-align: center; }
        /* CTA */
        .marketing-cta-section { text-align: center; padding: 96px 48px; background: linear-gradient(135deg, rgba(74,222,128,0.06), rgba(34,211,238,0.04)); border-top: 1px solid rgba(120,200,80,0.12); }
        .marketing-cta-section h2 { font-size: 2.5rem; font-weight: 700; margin-bottom: 16px; }
        .marketing-cta-section p { color: #8aac8a; font-size: 1.1rem; margin-bottom: 36px; }
        .marketing-cta-actions { display: flex; gap: 20px; justify-content: center; }
        /* Footer */
        .marketing-footer { border-top: 1px solid rgba(120,200,80,0.12); padding: 48px; }
        .marketing-footer-content { display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto 32px; }
        .marketing-footer-links { display: flex; gap: 32px; }
        .marketing-footer-links a { color: #6a8c6a; text-decoration: none; transition: color 0.2s; }
        .marketing-footer-links a:hover { color: #f0faf0; }
        .marketing-footer-bottom { text-align: center; color: #4a6a4a; font-size: 0.85rem; }
        @media (max-width: 768px) {
          .marketing-hero { grid-template-columns: 1fr; padding: 48px 24px; }
          .marketing-steps { grid-template-columns: 1fr; }
          .sellers-categories { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
