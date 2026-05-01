import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SellReportPage({ searchParams }: { searchParams: { id?: string } }) {
  const { id } = await searchParams
  
  if (!id) {
    return notFound()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase env vars for report page")
    return notFound()
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: lead, error } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !lead || !lead.metadata?.ai_estimate_result) {
    return notFound()
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
        <div className="promo-main-glass" style={{ maxWidth: '800px', flexDirection: 'column', padding: '40px' }}>
          
          <div className="fade-in-up" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#14532d', marginBottom: '8px' }}>Your Backyard Potential</h2>
            <p style={{ fontSize: '1.05rem', color: '#4b5563', marginBottom: '24px' }}>
              Hi {firstName}, here is the market data analysis for your <strong>{size}</strong> garden in <strong>{lead.zipcode}</strong>.
            </p>
            
            <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(22,163,74,0.1))', padding: '40px 20px', borderRadius: '24px', marginBottom: '24px', border: '1px solid rgba(34,197,94,0.3)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -20, right: -20, fontSize: '8rem', opacity: 0.1 }}>🌿</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ fontSize: '1rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Estimated Annual Earnings</div>
                <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, border: '1px solid #bbf7d0' }}>AI ESTIMATED</span>
              </div>
              <div style={{ fontSize: '5rem', fontWeight: 900, color: '#14532d', lineHeight: 1, marginBottom: '16px' }}>
                ${result.estimated_annual_earnings}
              </div>
              <p style={{ fontSize: '1.05rem', color: '#166534', lineHeight: 1.5, margin: '0 auto', maxWidth: '80%', fontStyle: 'italic', opacity: 0.9 }}>
                {result.reasoning}
              </p>
            </div>

            <div style={{ textAlign: 'left', background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#1f2937', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🍅</span> Projected Yield
              </h3>
              <p style={{ color: '#4b5563', lineHeight: 1.6, fontSize: '1.05rem' }}>{result.excess_produce}</p>
            </div>

            <div style={{ background: '#f0fdf4', padding: '24px', borderRadius: '16px', marginBottom: '32px', border: '1px solid #bbf7d0', textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ fontSize: '1.8rem' }}>🎯</div>
                <p style={{ fontSize: '1.1rem', color: '#166534', fontWeight: 600, margin: 0, paddingTop: '4px' }}>
                  That's enough extra cash per year to pay for:
                </p>
              </div>
              <ul style={{ margin: '0 0 0 46px', padding: 0, listStyleType: 'none', color: '#15803d', fontStyle: 'italic', lineHeight: 1.6, fontSize: '1.05rem' }}>
                {(result.analogies || []).map((analogy: string, i: number) => (
                  <li key={i} style={{ marginBottom: '8px', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '-20px' }}>•</span> {analogy}
                  </li>
                ))}
              </ul>
            </div>

            <Link 
              href={`/create-listing?email=${encodeURIComponent(lead.email || '')}&name=${encodeURIComponent(lead.name || '')}&zipcode=${encodeURIComponent(lead.zipcode || '')}`} 
              className="btn-action" 
              style={{ display: 'inline-block', textDecoration: 'none', padding: '20px 40px', fontSize: '1.2rem' }}
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

        .btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; font-weight: 800; border-radius: 16px; cursor: pointer; transition: all 0.3s; box-shadow: 0 10px 25px rgba(34,197,94,0.3); }
        .btn-action:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(34,197,94,0.4); }

        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
