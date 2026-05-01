import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function NutritionReportPage({ searchParams }: { searchParams: { id?: string } }) {
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

  if (error || !lead || !lead.metadata?.ai_nutrition_result) {
    return notFound()
  }

  const result = lead.metadata.ai_nutrition_result
  const firstName = lead.name?.split(' ')[0] || "there"

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
        <div className="promo-main-glass" style={{ maxWidth: '900px', flexDirection: 'column', padding: '40px' }}>
          
          <div className="fade-in-up" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#14532d', marginBottom: '8px' }}>Your Nutrition Loss Report</h2>
            <p style={{ fontSize: '1.1rem', color: '#4b5563', marginBottom: '32px' }}>
              Hi {firstName}, here is the post-harvest analysis for your typical grocery list.
            </p>
            
            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '24px', textAlign: 'left', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                <thead>
                  <tr style={{ background: '#f0fdf4', color: '#166534', textAlign: 'left', borderBottom: '2px solid #bbf7d0' }}>
                    <th style={{ padding: '12px' }}>Produce</th>
                    <th style={{ padding: '12px' }}>Est. Time to Shelf</th>
                    <th style={{ padding: '12px' }}>Nutrient Loss</th>
                    <th style={{ padding: '12px' }}>Impacted Nutrients</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.items || []).map((item: any, i: number) => (
                    <tr key={i}>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', color: '#374151' }}>{item.name}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>{item.time_to_shelf}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', color: '#b91c1c', fontWeight: 'bold' }}>{item.nutrient_loss_pct}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', color: '#4b5563', fontSize: '0.9rem' }}>
                        {item.impacted_nutrients}
                        {item.evidence_link && (
                          <div style={{ marginTop: '4px' }}>
                            <a href={item.evidence_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#2563eb', textDecoration: 'underline' }}>Source</a>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '32px', textAlign: 'left' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#1f2937', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💡</span> Why is this happening?
              </h3>
              <p style={{ color: '#4b5563', lineHeight: 1.6, fontSize: '1.05rem' }}>{result.summary}</p>
            </div>

            <div style={{ background: '#f0fdf4', padding: '32px', borderRadius: '16px', marginBottom: '16px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.4rem', color: '#166534', fontWeight: 800, marginBottom: '16px' }}>Stop Eating Depleted Food.</h3>
              <p style={{ fontSize: '1.1rem', color: '#15803d', marginBottom: '24px' }}>
                When you buy directly from neighbors on CasaGrown, your food goes from harvest to your plate in hours—not weeks.
              </p>
              <Link href="/" className="btn-action" style={{ display: 'inline-block', textDecoration: 'none', padding: '18px 36px', fontSize: '1.1rem' }}>
                Shop Local on CasaGrown →
              </Link>
            </div>
            
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .casagrown-promo-page { min-height: 100vh; font-family: 'Inter', sans-serif; position: relative; display: flex; flex-direction: column; color: #1a3320; overflow-x: hidden; }

        .promo-bg-layer { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-size: cover; background-position: center; z-index: -2; transform: scale(1.02); }
        .promo-bg-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(135deg, rgba(30,58,138,0.8) 0%, rgba(20,83,45,0.4) 100%); z-index: -1; }

        .casagrown-nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: rgba(255,255,255,0.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.4); z-index: 10; }
        .nav-left { display: flex; align-items: center; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #14532d; letter-spacing: -0.5px; }
        .nav-logo-img { height: 40px; width: auto; }

        .promo-content-wrapper { flex: 1; display: flex; justify-content: center; align-items: center; padding: 60px 24px; }

        .promo-main-glass { display: flex; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.6); border-radius: 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.15); width: 100%; overflow: hidden; }

        .btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; font-weight: 800; border-radius: 16px; cursor: pointer; transition: all 0.3s; box-shadow: 0 10px 25px rgba(34,197,94,0.3); }
        .btn-action:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(34,197,94,0.4); }

        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
