'use client'

import Link from 'next/link'
import { useMarketingAnalytics, trackEvent } from '@/lib/crm-analytics'

export default function MarketingHomePage() {
  useMarketingAnalytics('/')

  return (
    <div className="marketing-root">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="marketing-nav">
        <Link href="/" className="marketing-logo">
          🌱 CasaGrown
        </Link>
        <div className="marketing-nav-links">
          <Link href="/sellers">For Sellers</Link>
          <Link href="/market">Browse Market</Link>
          <Link
            href="/join"
            className="marketing-nav-cta"
            onClick={() => trackEvent('cta_clicked', '/', { button: 'nav-join' })}
          >
            Join Free
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="marketing-hero">
        <div className="marketing-hero-content">
          <div className="marketing-hero-badge">🥦 Locally Grown · Neighbor Sourced</div>
          <h1 className="marketing-hero-title">
            Fresh Food from Your<br />
            <span className="marketing-hero-gradient">Neighbors' Backyards</span>
          </h1>
          <p className="marketing-hero-subtitle">
            11.5 billion lbs of backyard produce goes to waste every year.
            CasaGrown connects growers and buyers in your community —
            so fresh, local food actually reaches your table.
          </p>
          <div className="marketing-hero-actions">
            <Link
              href="/join"
              className="marketing-btn-primary"
              onClick={() => trackEvent('cta_clicked', '/', { button: 'hero-start-buying' })}
            >
              Start Buying Fresh 🛒
            </Link>
            <Link
              href="/sellers"
              className="marketing-btn-secondary"
              onClick={() => trackEvent('cta_clicked', '/', { button: 'hero-start-selling' })}
            >
              Start Selling →
            </Link>
          </div>
          <div className="marketing-hero-social-proof">
            <span>⭐ 4.9 rating</span>
            <span>·</span>
            <span>10,000+ neighbors</span>
            <span>·</span>
            <span>Zero waste mission</span>
          </div>
        </div>
        <div className="marketing-hero-visual">
          <div className="marketing-produce-grid">
            {['🍅', '🥕', '🥦', '🍋', '🥑', '🍓', '🌽', '🫑', '🍇'].map((emoji, i) => (
              <div key={i} className="marketing-produce-item" style={{ animationDelay: `${i * 0.1}s` }}>
                {emoji}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="marketing-section">
        <h2 className="marketing-section-title">How CasaGrown Works</h2>
        <div className="marketing-steps">
          {[
            { icon: '📍', title: 'Find Your Community', desc: 'Join your local CasaGrown community and discover neighbors who grow produce.' },
            { icon: '🛒', title: 'Browse & Order', desc: 'Shop fresh tomatoes, herbs, eggs, honey and more from neighbors nearby.' },
            { icon: '🤝', title: 'Pick Up or Get Delivery', desc: 'Arrange pickup or delivery directly with your neighbor. Simple, local, fresh.' },
          ].map((step, i) => (
            <div key={i} className="marketing-step">
              <div className="marketing-step-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Social proof ─────────────────────────────────────────── */}
      <section className="marketing-section marketing-section-alt">
        <h2 className="marketing-section-title">What Neighbors Say</h2>
        <div className="marketing-testimonials">
          {[
            { quote: "I sell my tomatoes every week and made $400 last month just from my garden surplus!", author: "Maria G.", role: "Seller, San Jose" },
            { quote: "Fresh eggs from my neighbor? Yes please. Way better than the store and I know exactly where they come from.", author: "David K.", role: "Buyer, Austin" },
            { quote: "I was throwing away so much produce. Now my neighbors buy it and I earn extra income. Win-win!", author: "Priya S.", role: "Seller, Cupertino" },
          ].map((t, i) => (
            <div key={i} className="marketing-testimonial">
              <p className="marketing-testimonial-quote">"{t.quote}"</p>
              <div className="marketing-testimonial-author">
                <strong>{t.author}</strong>
                <span>{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ──────────────────────────────────────────── */}
      <section className="marketing-cta-section">
        <h2>Ready to Join Your Neighborhood?</h2>
        <p>It's free to join. Start buying or selling fresh produce today.</p>
        <div className="marketing-cta-actions">
          <Link
            href="/join"
            className="marketing-btn-primary marketing-btn-large"
            onClick={() => trackEvent('cta_clicked', '/', { button: 'bottom-cta' })}
          >
            Join CasaGrown — It's Free
          </Link>
          <Link href="/sellers" className="marketing-link-secondary">
            I want to sell →
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="marketing-footer">
        <div className="marketing-footer-content">
          <div className="marketing-footer-brand">
            <span className="marketing-logo">🌱 CasaGrown</span>
            <p>Fresh food from your neighbors' backyards.</p>
          </div>
          <div className="marketing-footer-links">
            <Link href="/market">Browse Market</Link>
            <Link href="/sellers">For Sellers</Link>
            <Link href="/join">Join Free</Link>
          </div>
        </div>
        <div className="marketing-footer-bottom">
          <p>© {new Date().getFullYear()} CasaGrown. All rights reserved.</p>
        </div>
      </footer>

      <style jsx>{`
        .marketing-root {
          min-height: 100vh;
          background: #0a0f0a;
          color: #f0faf0;
          font-family: 'Inter', system-ui, sans-serif;
        }
        /* Nav */
        .marketing-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 48px;
          position: sticky; top: 0; z-index: 100;
          background: rgba(10,15,10,0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(120,200,100,0.12);
        }
        .marketing-logo { font-size: 1.4rem; font-weight: 700; color: #7ec85a; text-decoration: none; }
        .marketing-nav-links { display: flex; align-items: center; gap: 32px; }
        .marketing-nav-links a { color: #a0bfa0; text-decoration: none; font-size: 0.95rem; transition: color 0.2s; }
        .marketing-nav-links a:hover { color: #f0faf0; }
        .marketing-nav-cta {
          background: #4ade80; color: #0a1f0a; border-radius: 24px;
          padding: 8px 20px; font-weight: 600; transition: all 0.2s;
        }
        .marketing-nav-cta:hover { background: #86efac; transform: translateY(-1px); color: #0a1f0a !important; }
        /* Hero */
        .marketing-hero {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 48px; align-items: center;
          padding: 96px 48px;
          max-width: 1200px; margin: 0 auto;
        }
        .marketing-hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(120,200,80,0.12); border: 1px solid rgba(120,200,80,0.25);
          border-radius: 100px; padding: 6px 16px;
          font-size: 0.85rem; color: #7ec85a; font-weight: 500;
          margin-bottom: 24px;
        }
        .marketing-hero-title { font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; line-height: 1.1; margin-bottom: 24px; }
        .marketing-hero-gradient {
          background: linear-gradient(135deg, #4ade80, #22d3ee);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .marketing-hero-subtitle { font-size: 1.15rem; color: #8aac8a; line-height: 1.7; margin-bottom: 36px; }
        .marketing-hero-actions { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
        .marketing-hero-social-proof { display: flex; gap: 12px; align-items: center; color: #6a8c6a; font-size: 0.9rem; }
        /* Produce grid */
        .marketing-produce-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 16px; padding: 24px;
        }
        .marketing-produce-item {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(120,200,80,0.12);
          border-radius: 20px; padding: 32px; font-size: 3rem; text-align: center;
          animation: float 3s ease-in-out infinite alternate;
        }
        @keyframes float { 0% { transform: translateY(0); } 100% { transform: translateY(-8px); } }
        /* Buttons */
        .marketing-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #4ade80, #22c55e);
          color: #052e16; font-weight: 700; border-radius: 12px;
          padding: 14px 28px; text-decoration: none; font-size: 1rem;
          transition: all 0.2s; box-shadow: 0 4px 24px rgba(74,222,128,0.2);
        }
        .marketing-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(74,222,128,0.3); }
        .marketing-btn-primary.marketing-btn-large { padding: 18px 36px; font-size: 1.1rem; border-radius: 16px; }
        .marketing-btn-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          border: 1.5px solid rgba(120,200,80,0.3); color: #7ec85a;
          border-radius: 12px; padding: 14px 28px; text-decoration: none;
          font-weight: 600; font-size: 1rem; transition: all 0.2s;
        }
        .marketing-btn-secondary:hover { background: rgba(120,200,80,0.08); border-color: rgba(120,200,80,0.6); }
        /* Sections */
        .marketing-section { padding: 96px 48px; max-width: 1200px; margin: 0 auto; }
        .marketing-section-alt { background: rgba(120,200,80,0.03); border-radius: 32px; }
        .marketing-section-title { font-size: 2.2rem; font-weight: 700; text-align: center; margin-bottom: 56px; }
        /* Steps */
        .marketing-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .marketing-step {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(120,200,80,0.12);
          border-radius: 24px; padding: 40px 32px; text-align: center; transition: transform 0.2s;
        }
        .marketing-step:hover { transform: translateY(-4px); border-color: rgba(120,200,80,0.25); }
        .marketing-step-icon { font-size: 2.5rem; margin-bottom: 16px; }
        .marketing-step h3 { font-size: 1.2rem; font-weight: 600; margin-bottom: 12px; }
        .marketing-step p { color: #6a8c6a; line-height: 1.6; }
        /* Testimonials */
        .marketing-testimonials { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .marketing-testimonial {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(120,200,80,0.1);
          border-radius: 20px; padding: 32px;
        }
        .marketing-testimonial-quote { font-size: 1rem; color: #c0d8c0; line-height: 1.7; margin-bottom: 20px; font-style: italic; }
        .marketing-testimonial-author { display: flex; flex-direction: column; gap: 4px; }
        .marketing-testimonial-author strong { color: #f0faf0; }
        .marketing-testimonial-author span { color: #6a8c6a; font-size: 0.85rem; }
        /* CTA Section */
        .marketing-cta-section {
          text-align: center; padding: 96px 48px;
          background: linear-gradient(135deg, rgba(74,222,128,0.06), rgba(34,211,238,0.04));
          border-top: 1px solid rgba(120,200,80,0.12);
        }
        .marketing-cta-section h2 { font-size: 2.5rem; font-weight: 700; margin-bottom: 16px; }
        .marketing-cta-section p { color: #8aac8a; font-size: 1.1rem; margin-bottom: 36px; }
        .marketing-cta-actions { display: flex; gap: 20px; justify-content: center; align-items: center; }
        .marketing-link-secondary { color: #7ec85a; text-decoration: none; font-weight: 600; }
        /* Footer */
        .marketing-footer { border-top: 1px solid rgba(120,200,80,0.12); padding: 48px; }
        .marketing-footer-content { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; max-width: 1200px; margin: 0 auto 32px; }
        .marketing-footer-brand p { color: #6a8c6a; margin-top: 8px; font-size: 0.9rem; }
        .marketing-footer-links { display: flex; gap: 32px; }
        .marketing-footer-links a { color: #6a8c6a; text-decoration: none; transition: color 0.2s; }
        .marketing-footer-links a:hover { color: #f0faf0; }
        .marketing-footer-bottom { text-align: center; color: #4a6a4a; font-size: 0.85rem; }
        @media (max-width: 768px) {
          .marketing-hero { grid-template-columns: 1fr; padding: 48px 24px; }
          .marketing-produce-grid { display: none; }
          .marketing-steps { grid-template-columns: 1fr; }
          .marketing-testimonials { grid-template-columns: 1fr; }
          .marketing-nav { padding: 16px 24px; }
          .marketing-nav-links { gap: 16px; }
        }
      `}</style>
    </div>
  )
}
