'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'

export default function NutritionLossLandingPage() {
  const [step, setStep] = useState<'intro' | 'produce' | 'calculating' | 'lead-capture' | 'queued' | 'results'>('intro')
  
  // Questionnaire State
  const [selectedProduce, setSelectedProduce] = useState<string[]>([])
  
  type CustomItem = { id: string, name: string }
  const [customProduceList, setCustomProduceList] = useState<CustomItem[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<any>(null)

  // Lead Capture State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const loadingMessages = [
    "Compiling post-harvest agricultural data...",
    "Extracting USDA nutritional degradation data...",
    "Analyzing supply chain cold-storage timelines...",
    "Cross-referencing standard grocery travel times...",
    "Calculating nutrient loss for your selected items...",
    "Finalizing your personalized nutrition report..."
  ]
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingMsgIdx(prev => (prev + 1) % loadingMessages.length)
      }, 4000)
    } else {
      setLoadingMsgIdx(0)
    }
    return () => clearInterval(interval)
  }, [isLoading])

  // Tracking State
  const [trackingData, setTrackingData] = useState<{
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    referrer?: string;
    current_url?: string;
  }>({})

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setTrackingData({
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_content: params.get('utm_content') || undefined,
        referrer: document.referrer || undefined,
        current_url: window.location.href,
      });

      const leadId = params.get('id');
      if (leadId) {
        setIsLoading(true);
        const supabase = createClient();
        supabase.from('crm_leads').select('metadata, email, name').eq('id', leadId).single()
          .then(({ data }) => {
            if (data && data.metadata?.ai_nutrition_result) {
              setResults(data.metadata.ai_nutrition_result);
              setEmail(data.email || '');
              setName(data.name || '');
              setStep('results');
            }
          })
          .catch(err => console.error("Failed to load existing report:", err))
          .finally(() => setIsLoading(false));
      }
    }
  }, []);

  const toggleSelection = (item: string) => {
    if (selectedProduce.includes(item)) {
      setSelectedProduce(selectedProduce.filter(i => i !== item))
    } else {
      setSelectedProduce([...selectedProduce, item])
    }
  }

  const handleCalculate = async () => {
    const finalProduce = [
      ...selectedProduce.filter(p => p !== 'Other'),
      ...customProduceList.filter(c => c.name.trim()).map(c => c.name.trim())
    ]
    if (finalProduce.length === 0) {
      setErrorMsg("Please select at least one item.")
      return
    }
    setErrorMsg("")
    setStep('calculating')
    setTimeout(() => {
      setStep('lead-capture')
    }, 1500)
  }

  const handleLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email) return
    
    setIsLoading(true)
    
    try {
      const supabase = createClient()
      
      const finalProduce = [
        ...selectedProduce.filter(p => p !== 'Other'),
        ...customProduceList.filter(c => c.name.trim()).map(c => c.name.trim())
      ]

      const { data, error } = await supabase.functions.invoke('estimate-nutrition-loss', {
        body: {
          produce: finalProduce,
          lead: { 
            name, 
            email, 
            phone, 
            marketingConsent,
            ...trackingData 
          }
        }
      })
      
      if (error) {
        console.error("Backend request failed:", error)
      } else if (data && data.error) {
        console.error("Function logic error:", data.error)
      } else if (data && data.ai_nutrition_result) {
        setResults(data.ai_nutrition_result)
        setStep('results')
        return
      }
      
      setStep('queued')
    } catch (err) {
      console.error("Failed to generate report", err)
      // Even if it times out or fails, we show the queued state so the user isn't stuck.
      // The background processor will pick up the lead if it was successfully persisted.
      setStep('queued')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="casagrown-promo-page">
      <nav className="casagrown-nav">
        <div className="nav-left">
          <Link href="/" className="nav-brand">
            <img src="/logo.png" alt="CasaGrown" className="nav-logo-img" />
            <span className="nav-brand-name">CasaGrown</span>
          </Link>
          <span className="nav-tagline">Fresh. Local. Trusted.</span>
        </div>
        <div>
          <Link href="/login" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#14532d', textDecoration: 'none' }}>
            Log In
          </Link>
        </div>
      </nav>

      <div className="promo-bg-layer" style={{ backgroundImage: "url('/tote-bag-hero.png')" }}>
        <div className="promo-bg-overlay"></div>
      </div>

      <div className="promo-content-wrapper">
        <div className="promo-main-glass">
          
          {step === 'intro' && (
            <div className="promo-hero-section fade-in-up">
              <h1 className="promo-headline">The Post-Harvest Nutrient Gap</h1>
              <div className="promo-description">
                <p style={{ marginBottom: '16px', fontSize: '1rem' }}>Store-bought produce loses significant nutrition between harvest and the retail shelf. Vitamin C, for instance, degrades rapidly under grocery store lighting and transit.</p>
                
                <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ color: '#1e3a8a', fontSize: '1rem', marginBottom: '8px', borderBottom: '2px solid #bfdbfe', paddingBottom: '8px' }}>Est. Nutrient Loss (Harvest To Shelf)</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#eff6ff', color: '#1e40af', textAlign: 'left' }}>
                        <th style={{ padding: '6px' }}>Produce</th>
                        <th style={{ padding: '6px' }}>Loss %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td style={{ padding: '6px', borderBottom: '1px solid #e5e7eb' }}>🥬 Spinach</td><td style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', color: '#b91c1c', fontWeight: 'bold' }}>50% - 80%</td></tr>
                      <tr><td style={{ padding: '6px', borderBottom: '1px solid #e5e7eb' }}>🥦 Broccoli</td><td style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', color: '#c2410c', fontWeight: 'bold' }}>25% - 55%</td></tr>
                      <tr><td style={{ padding: '6px', borderBottom: '1px solid #e5e7eb' }}>🍓 Strawberries</td><td style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', color: '#c2410c', fontWeight: 'bold' }}>30% - 40%</td></tr>
                      <tr><td style={{ padding: '6px' }}>🍎 Apples</td><td style={{ padding: '6px', color: '#b91c1c', fontWeight: 'bold' }}>25% - 50%</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="promo-form-section" style={{ flex: step === 'intro' ? 1.2 : 1, transition: 'all 0.4s ease' }}>
            <div className="dynamic-form" style={{ maxWidth: step === 'intro' ? 'none' : '600px', margin: step === 'intro' ? '0' : '0 auto', width: '100%', transition: 'all 0.4s ease' }}>
              
              {step === 'intro' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Analyze Your Grocery List</h2>
                  <p className="form-subheading">Curious how many nutrients your regular store-bought produce has already lost? Let's find out.</p>
                  <button onClick={() => setStep('produce')} className="btn-action">
                    Check My Nutrition Loss →
                  </button>
                </div>
              )}

              {step === 'produce' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">What produce do you buy most?</h2>
                  <p className="form-subheading">Select all that apply, or add your own.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {['Spinach', 'Broccoli', 'Strawberries', 'Apples', 'Tomatoes', 'Green Beans', 'Other'].map(item => {
                      const isSelected = selectedProduce.includes(item)
                      return (
                        <div key={item} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label className="checkbox-wrap" style={{ margin: 0, padding: '12px', height: '100%' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelection(item)}
                            />
                            <span className="checkbox-text" style={{ fontSize: '0.85rem' }}>{item}</span>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                  {selectedProduce.includes('Other') && (
                     <div className="fade-in-up" style={{ marginBottom: '24px', background: '#f9fafb', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: '#374151' }}>Custom Produce</h4>
                      {customProduceList.map((cp, idx) => (
                        <div key={cp.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="e.g. Radishes" 
                            value={cp.name}
                            onChange={e => setCustomProduceList(prev => prev.map(p => p.id === cp.id ? { ...p, name: e.target.value } : p))}
                            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                            autoFocus={idx === customProduceList.length - 1}
                          />
                          <button 
                            type="button" 
                            onClick={() => setCustomProduceList(prev => prev.filter(p => p.id !== cp.id))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 8px', fontSize: '1.2rem' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        type="button"
                        onClick={() => setCustomProduceList(prev => [...prev, { id: Math.random().toString(), name: '' }])}
                        style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginTop: '4px' }}
                      >
                        + Add another item
                      </button>
                    </div>
                  )}
                  {errorMsg && <div className="form-error-banner" style={{ marginBottom: 16 }}>{errorMsg}</div>}
                  <button 
                    onClick={handleCalculate} 
                    className="btn-action"
                  >
                    Calculate Loss
                  </button>
                </div>
              )}

              {step === 'calculating' && (
                <div className="promo-loading fade-in-up" style={{ height: '300px' }}>
                  <div className="spinner"></div>
                  <div>Analyzing post-harvest degradation data...</div>
                </div>
              )}

              {step === 'lead-capture' && (
                <form onSubmit={handleLeadCapture} className="fade-in-up">
                  <h2 className="form-heading">Your report is ready!</h2>
                  <p className="form-subheading">Where should we send your personalized nutrition loss analysis?</p>
                  
                  <div className="input-group">
                    <label>Full Name</label>
                    <input type="text" required placeholder="Jane Doe" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Email Address</label>
                    <input type="email" required placeholder="hello@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Phone Number (optional)</label>
                    <input type="tel" placeholder="(555) 555-5555" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  
                  <label className="checkbox-wrap" style={{ marginBottom: '24px' }}>
                    <input type="checkbox" required checked={marketingConsent} onChange={e => setMarketingConsent(e.target.checked)} />
                    <div className="checkbox-text" style={{ fontSize: '0.85rem' }}>
                      <strong>I agree to receive my report and marketing communications</strong>
                      <div style={{ marginTop: '4px', color: '#6b7280', lineHeight: 1.4 }}>
                        By checking this box, you consent to receive SMS and email marketing messages from CasaGrown. Reply STOP to cancel SMS.
                      </div>
                    </div>
                  </label>

                  <button type="submit" className="btn-action" style={{ opacity: isLoading ? 0.7 : 1, transition: 'all 0.3s' }} disabled={isLoading}>
                    {isLoading ? (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <span className="spinner" style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                        <span style={{ fontSize: '0.9rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {loadingMessages[loadingMsgIdx]}
                        </span>
                      </span>
                    ) : "Send My Report →"}
                  </button>
                  {errorMsg && <div className="form-error-banner" style={{ marginTop: 16 }}>{errorMsg}</div>}
                </form>
              )}

              {step === 'results' && results && (
                <div className="fade-in-up" style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#14532d', marginBottom: '8px' }}>Your Nutrition Loss Report</h2>
                  <p style={{ fontSize: '1.05rem', color: '#4b5563', marginBottom: '24px' }}>
                    We've emailed a copy of this report to {email}.
                  </p>

                  <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '24px', textAlign: 'left', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                      <thead>
                        <tr style={{ background: '#f0fdf4', color: '#166534', textAlign: 'left', borderBottom: '2px solid #bbf7d0' }}>
                          <th style={{ padding: '12px' }}>Produce</th>
                          <th style={{ padding: '12px' }}>Est. Time to Shelf</th>
                          <th style={{ padding: '12px' }}>Nutrient Loss</th>
                          <th style={{ padding: '12px' }}>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(results.items || []).map((item: any, i: number) => (
                          <tr key={i}>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', color: '#374151' }}>
                              {item.name}
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginTop: '4px' }}>
                                Impacts: {item.impacted_nutrients || "Vitamins"}
                              </div>
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>{item.time_to_shelf}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', color: '#b91c1c', fontWeight: 'bold' }}>{item.nutrient_loss_pct}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                              {item.evidence_link ? (
                                <a href={item.evidence_link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
                                  View Study
                                </a>
                              ) : (
                                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>N/A</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '32px', lineHeight: 1.6, background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    💡 <strong>Stop Eating Depleted Food.</strong> Connect with a like-minded community today to buy and sell home-grown, fully-nutritious produce in your neighborhood.
                  </p>
                  
                  <a href="https://casagrown.com/community" className="btn-action" style={{ display: 'block', textDecoration: 'none' }}>
                    Join the CasaGrown Community →
                  </a>
                </div>
              )}

              {step === 'queued' && (
                <div className="fade-in-up" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '16px' }}>📩</div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#14532d', marginBottom: '16px', lineHeight: 1.2 }}>
                    Your Analysis is On Its Way!
                  </h2>
                  <p style={{ fontSize: '1.1rem', color: '#166534', marginBottom: '16px', lineHeight: 1.6 }}>
                    Our AI is analyzing agricultural research data for your specific grocery items. We'll email your personalized nutrition report to <strong>{email}</strong> shortly.
                  </p>
                  <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '32px', lineHeight: 1.6, background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    💡 <strong>Don't wait for the report!</strong> Connect with a like-minded community today to buy and sell home-grown, fully-nutritious produce in your neighborhood.
                  </p>
                  
                  <a href="https://casagrown.com/community" className="btn-action" style={{ display: 'block', textDecoration: 'none' }}>
                    Join the CasaGrown Community →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
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
        .nav-tagline { font-weight: 600; font-size: 0.95rem; color: #166534; letter-spacing: 0.5px; border-left: 2px solid #bbf7d0; padding-left: 20px; }

        .promo-content-wrapper { flex: 1; display: flex; justify-content: center; align-items: center; padding: 60px 24px; }

        .promo-main-glass { display: flex; flex-direction: row; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.6); border-radius: 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.15); max-width: 1100px; width: 100%; overflow: hidden; }

        .promo-hero-section { flex: 0.8; padding: 40px; background: rgba(240, 253, 244, 0.5); border-right: 1px solid rgba(0,0,0,0.05); }
        .promo-form-section { flex: 1.2; padding: 40px 60px; display: flex; flex-direction: column; justify-content: center; background: #fff; }

        .promo-headline { font-size: 2.2rem; font-weight: 800; color: #14532d; line-height: 1.2; margin-bottom: 16px; letter-spacing: -1px; }
        .promo-description { font-size: 1.1rem; color: #166534; line-height: 1.6; }

        .dynamic-form { display: flex; flex-direction: column; }
        .form-heading { font-size: 1.8rem; font-weight: 800; color: #14532d; margin-bottom: 8px; }
        .form-subheading { font-size: 1.05rem; color: #4b5563; margin-bottom: 24px; line-height: 1.5; }
        
        .input-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .input-group label { font-size: 0.95rem; font-weight: 700; color: #374151; }
        .input-group input { padding: 16px 20px; border: 2px solid #e5e7eb; border-radius: 16px; font-size: 1.05rem; background: #f9fafb; transition: all 0.2s; }
        .input-group input:focus { outline: none; border-color: #22c55e; background: white; box-shadow: 0 0 0 4px rgba(34,197,94,0.1); }
        
        .checkbox-wrap { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 16px; background: #f9fafb; border-radius: 16px; border: 1px solid #e5e7eb; transition: all 0.2s; }
        .checkbox-wrap:hover { background: #f3f4f6; }
        .checkbox-wrap input { width: 20px; height: 20px; accent-color: #22c55e; cursor: pointer; }
        .checkbox-text { font-size: 0.95rem; color: #4b5563; font-weight: 600; }

        .btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; padding: 18px 32px; font-size: 1.15rem; font-weight: 800; border-radius: 16px; cursor: pointer; transition: all 0.3s; width: 100%; box-shadow: 0 10px 25px rgba(34,197,94,0.3); }
        .btn-action:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(34,197,94,0.4); }
        .btn-action:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

        .form-error-banner { background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 16px; border-radius: 12px; font-weight: 600; font-size: 0.95rem; }

        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        .promo-loading { display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 600; color: #166534; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(34,197,94,0.2); border-left-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .promo-main-glass { flex-direction: column; }
          .promo-hero-section { padding: 24px; border-right: none; border-bottom: 1px solid rgba(0,0,0,0.05); }
          .promo-form-section { padding: 32px 24px; }
          .promo-headline { font-size: 1.8rem; margin-bottom: 12px; }
          .casagrown-nav { padding: 16px 24px; }
          .nav-tagline { display: none; }
        }
      `}</style>
    </div>
  )
}
