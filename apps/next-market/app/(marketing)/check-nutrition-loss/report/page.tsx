import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function NutritionReportPage({ searchParams }: { searchParams: { id?: string } }) {
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

  if (!lead || !lead.metadata?.ai_nutrition_result) {
    if (id === 'demo' || id === 'sample' || !id) {
      lead = {
        name: 'Alex Rivera',
        email: 'alex@example.com',
        metadata: {
          ai_nutrition_result: {
            items: [
              { name: 'Spinach', time_to_shelf: '7-10 days', nutrient_loss_pct: '80% Vitamin C', impacted_nutrients: 'Vitamin C, Folate' },
              { name: 'Tomatoes', time_to_shelf: '10-14 days', nutrient_loss_pct: '45% Lycopene', impacted_nutrients: 'Lycopene, Flavor aromatics' },
              { name: 'Strawberries', time_to_shelf: '5-8 days', nutrient_loss_pct: '50% Polyphenols', impacted_nutrients: 'Antioxidants, Vitamin C' }
            ],
            summary: 'Produce transported over long distances loses the majority of its delicate phytonutrients and antioxidants before it reaches store shelves.'
          }
        }
      }
    } else {
      return notFound()
    }
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
        <div className="promo-main-glass report-card">
          
          <div className="fade-in-up" style={{ textAlign: 'center', width: '100%' }}>
            <h2 className="report-title">Your Nutrition Loss Report</h2>
            <p className="report-subheading">
              Hi {firstName}, here is the post-harvest analysis for your typical grocery list.
            </p>
            
            <div className="table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                <thead>
                  <tr style={{ background: '#f0fdf4', color: '#166534', textAlign: 'left', borderBottom: '2px solid #bbf7d0' }}>
                    <th style={{ padding: '12px 10px' }}>Produce</th>
                    <th style={{ padding: '12px 10px' }}>Est. Time to Shelf</th>
                    <th style={{ padding: '12px 10px' }}>Nutrient Loss</th>
                    <th style={{ padding: '12px 10px' }}>Impacted Nutrients</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.items || []).map((item: any, i: number) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', color: '#374151' }}>{item.name}</td>
                      <td style={{ padding: '12px 10px', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>{item.time_to_shelf}</td>
                      <td style={{ padding: '12px 10px', borderBottom: '1px solid #e5e7eb', color: '#b91c1c', fontWeight: 'bold' }}>{item.nutrient_loss_pct}</td>
                      <td style={{ padding: '12px 10px', borderBottom: '1px solid #e5e7eb', color: '#4b5563', fontSize: '0.85rem' }}>
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

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', textAlign: 'left' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#1f2937', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💡</span> Why is this happening?
              </h3>
              <p style={{ color: '#4b5563', lineHeight: 1.6, fontSize: '0.95rem', margin: 0 }}>{result.summary}</p>
            </div>

            <div className="report-cta-box">
              <h3 style={{ fontSize: '1.3rem', color: '#166534', fontWeight: 800, marginBottom: '12px' }}>Stop Eating Depleted Food.</h3>
              <p style={{ fontSize: '1rem', color: '#15803d', marginBottom: '20px', lineHeight: 1.5 }}>
                When you buy directly from neighbors on CasaGrown, your food goes from harvest to your plate in hours—not weeks.
              </p>
              <Link href="/" className="btn-action report-cta-btn">
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

        .report-card { max-width: 900px; flex-direction: column; padding: 40px; }
        .report-title { font-size: 2.2rem; font-weight: 800; color: #14532d; margin-bottom: 8px; }
        .report-subheading { font-size: 1.1rem; color: #4b5563; margin-bottom: 28px; }
        .table-wrapper { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-bottom: 24px; text-align: left; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .report-cta-box { background: #f0fdf4; padding: 28px; border-radius: 16px; margin-bottom: 16px; border: 1px solid #bbf7d0; text-align: center; }
        .report-cta-btn { display: inline-block; text-decoration: none; padding: 16px 32px; font-size: 1.1rem; width: auto; }

        .btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; font-weight: 800; border-radius: 16px; cursor: pointer; transition: all 0.3s; box-shadow: 0 10px 25px rgba(34,197,94,0.3); }
        .btn-action:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(34,197,94,0.4); }

        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 600px) {
          .promo-content-wrapper { padding: 16px 12px; }
          .report-card { padding: 20px 14px; border-radius: 20px; }
          .casagrown-nav { padding: 12px 16px; }
          .report-title { font-size: 1.6rem; }
          .report-subheading { font-size: 0.95rem; margin-bottom: 18px; }
          .table-wrapper { padding: 12px 8px; border-radius: 12px; }
          .report-cta-box { padding: 20px 14px; border-radius: 14px; }
          .report-cta-btn { display: block; width: 100%; padding: 14px 20px; font-size: 1rem; }
        }
      `}</style>
    </div>
  )
}
