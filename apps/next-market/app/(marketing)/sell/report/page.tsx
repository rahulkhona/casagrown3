import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SellReportPage({ searchParams }: { searchParams: { id?: string } }) {
  const { id } = await searchParams
  
  let lead: any = null

  if (id && id !== 'demo' && id !== 'sample') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { data } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', id)
        .single()
      lead = data
    }
  }

  if (!lead || !lead.metadata?.ai_estimate_result) {
    if (id === 'demo' || id === 'sample' || !id) {
      lead = {
        name: 'Alex Rivera',
        email: 'alex@example.com',
        zipcode: '95125',
        metadata: {
          garden_size: 'Large Backyard Garden',
          ai_estimate_result: {
            estimated_annual_earnings: '1,850',
            reasoning: 'Based on high local demand for heirloom tomatoes and fresh herbs in 95125.',
            excess_produce: 'Approx. 400 lbs of tomatoes, 60 lbs of peppers, and fresh culinary herbs.',
            analogies: ['A weekend getaway with the family', 'All your annual seed and gardening supplies', 'A brand new drip irrigation system']
          }
        }
      }
    } else {
      return notFound()
    }
  }

  const result = lead.metadata.ai_estimate_result
  const firstName = lead.name?.split(' ')[0] || "there"
  const size = lead.metadata.garden_size || "Medium"

  return (
    <div className="casagrown-promo-page">
      <nav className="casagrown-nav">
        <div className="nav-left">
          <Link href="/" className="nav-brand">
            <img src="/logo.png" alt="CasaGrown" className="nav-logo-img" />
            <span className="nav-brand-name">CasaGrown</span>
          </Link>
        </div>
      </nav>

      <div className="promo-bg-layer" style={{ backgroundImage: "url('/tote-bag-hero.png')" }}>
        <div className="promo-bg-overlay"></div>
      </div>

      <div className="promo-content-wrapper">
        <div className="promo-main-glass report-card">
          
          <div className="fade-in-up" style={{ textAlign: 'center', width: '100%' }}>
            <h2 className="report-title">Your Backyard Potential</h2>
            <p className="report-subheading">
              Hi {firstName}, here is the market data analysis for your <strong>{size}</strong> garden in <strong>{lead.zipcode}</strong>.
            </p>
            
            <div className="earnings-hero-box">
              <div style={{ position: 'absolute', top: -20, right: -20, fontSize: '8rem', opacity: 0.1 }}>🌿</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.95rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Estimated Annual Earnings</div>
                <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, border: '1px solid #bbf7d0' }}>AI ESTIMATED</span>
              </div>
              <div className="earnings-hero-value">
                ${result.estimated_annual_earnings}
              </div>
              <p className="earnings-hero-reasoning">
                {result.reasoning}
              </p>
            </div>

            <div style={{ textAlign: 'left', background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#1f2937', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🍅</span> Projected Yield
              </h3>
              <p style={{ color: '#4b5563', lineHeight: 1.6, fontSize: '0.95rem', margin: 0 }}>{result.excess_produce}</p>
            </div>

            <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '16px', marginBottom: '28px', border: '1px solid #bbf7d0', textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ fontSize: '1.6rem' }}>🎯</div>
                <p style={{ fontSize: '1.05rem', color: '#166534', fontWeight: 600, margin: 0, paddingTop: '2px' }}>
                  That's enough extra cash per year to pay for:
                </p>
              </div>
              <ul style={{ margin: '0 0 0 36px', padding: 0, listStyleType: 'none', color: '#15803d', fontStyle: 'italic', lineHeight: 1.6, fontSize: '0.95rem' }}>
                {(result.analogies || []).map((analogy: string, i: number) => (
                  <li key={i} style={{ marginBottom: '6px', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '-16px' }}>•</span> {analogy}
                  </li>
                ))}
              </ul>
            </div>

            <Link 
              href={`/create-listing?email=${encodeURIComponent(lead.email || '')}&name=${encodeURIComponent(lead.name || '')}&zipcode=${encodeURIComponent(lead.zipcode || '')}`} 
              className="btn-action report-cta-btn"
            >
              Start Selling on CasaGrown →
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .casagrown-promo-page {
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #1a3320;
          overflow-x: hidden;
        }

        .promo-bg-layer {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-size: cover;
          background-position: center;
          z-index: -2;
          transform: scale(1.02);
        }
        .promo-bg-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(135deg, rgba(20,83,45,0.8) 0%, rgba(20,83,45,0.4) 100%);
          z-index: -1;
        }

        .casagrown-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          background: rgba(255,255,255,0.9);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.4);
          z-index: 10;
        }
        .nav-left { display: flex; align-items: center; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #14532d; letter-spacing: -0.5px; }
        .nav-logo-img { height: 40px; width: auto; }

        .promo-content-wrapper {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 60px 24px;
        }

        .promo-main-glass {
          display: flex;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 32px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.15);
          width: 100%;
          overflow: hidden;
        }

        .report-card {
          max-width: 800px;
          flex-direction: column;
          padding: 40px;
        }

        .report-title {
          font-size: 2rem;
          font-weight: 800;
          color: #14532d;
          margin-bottom: 8px;
        }

        .report-subheading {
          font-size: 1.05rem;
          color: #4b5563;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .earnings-hero-box {
          background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(22,163,74,0.1));
          padding: 36px 20px;
          border-radius: 24px;
          margin-bottom: 24px;
          border: 1px solid rgba(34,197,94,0.3);
          position: relative;
          overflow: hidden;
        }

        .earnings-hero-value {
          font-size: clamp(2.8rem, 8vw, 4.5rem);
          font-weight: 900;
          color: #14532d;
          line-height: 1.1;
          margin-bottom: 14px;
        }

        .earnings-hero-reasoning {
          font-size: 1rem;
          color: #166534;
          line-height: 1.5;
          margin: 0 auto;
          max-width: 90%;
          font-style: italic;
          opacity: 0.9;
        }

        .report-cta-btn {
          display: inline-block;
          text-decoration: none;
          padding: 18px 36px;
          font-size: 1.15rem;
          width: auto;
        }

        .btn-action {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          border: none;
          font-weight: 800;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 10px 25px rgba(34,197,94,0.3);
        }
        .btn-action:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(34,197,94,0.4); }

        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 600px) {
          .promo-content-wrapper { padding: 16px 12px; }
          .report-card { padding: 24px 16px; border-radius: 20px; }
          .casagrown-nav { padding: 12px 16px; }
          .report-title { font-size: 1.6rem; }
          .report-subheading { font-size: 0.95rem; margin-bottom: 18px; }
          .earnings-hero-box { padding: 24px 14px; border-radius: 18px; }
          .earnings-hero-value { font-size: clamp(2.2rem, 11vw, 3.2rem); }
          .earnings-hero-reasoning { max-width: 100%; font-size: 0.9rem; }
          .report-cta-btn { display: block; width: 100%; padding: 16px 20px; font-size: 1.05rem; }
        }
      `}</style>
    </div>
  )
}
