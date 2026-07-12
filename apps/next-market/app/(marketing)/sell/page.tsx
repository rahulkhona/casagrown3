'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { trackEvent, trackFieldInteract, trackStepTiming, resetSessionId } from '../../../lib/crm-analytics'

export default function SellLandingPage() {

  const [step, setStep] = useState<'intro' | 'zipcode' | 'size' | 'plants' | 'trees' | 'calculating' | 'lead-capture' | 'results' | 'queued'>('intro')

  const stepEnteredAt = React.useRef(Date.now())
  const prevStepRef = React.useRef<string>('intro')
  const wentNext = React.useRef(false)
  const stepRef = React.useRef(step)

  // Questionnaire State
  const [zipcode, setZipcode] = useState('')
  const [gardenSize, setGardenSize] = useState('')
  const [selectedPlants, setSelectedPlants] = useState<string[]>([])
  const [plantQuantities, setPlantQuantities] = useState<Record<string, string | number>>({})
  const [selectedTrees, setSelectedTrees] = useState<string[]>([])
  const [treeQuantities, setTreeQuantities] = useState<Record<string, string | number>>({})
  
  type CustomItem = { id: string, name: string, qty: string | number }
  const [customPlantsList, setCustomPlantsList] = useState<CustomItem[]>([])
  const [customTreesList, setCustomTreesList] = useState<CustomItem[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  // Lead Capture State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const zipcodeRef = React.useRef(zipcode)
  const gardenSizeRef = React.useRef(gardenSize)
  const selectedPlantsRef = React.useRef(selectedPlants)
  const selectedTreesRef = React.useRef(selectedTrees)
  const nameRef = React.useRef(name)
  const emailRef = React.useRef(email)
  const phoneRef = React.useRef(phone)

  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    zipcodeRef.current = zipcode
    gardenSizeRef.current = gardenSize
    selectedPlantsRef.current = selectedPlants
    selectedTreesRef.current = selectedTrees
    nameRef.current = name
    emailRef.current = email
    phoneRef.current = phone
  }, [zipcode, gardenSize, selectedPlants, selectedTrees, name, email, phone])

  useEffect(() => {
    const stepIndexes: Record<string, number> = {
      'intro': 1, 'zipcode': 2, 'size': 3, 'plants': 4, 'trees': 5,
      'calculating': 6, 'lead-capture': 7, 'results': 8, 'queued': 9
    }

    if (step === 'zipcode') {
      trackFieldInteract('/sell', 2, 'next_button', false)
    } else if (step === 'size') {
      trackFieldInteract('/sell', 3, 'next_button', false)
    } else if (step === 'plants') {
      trackFieldInteract('/sell', 4, 'next_button', false)
    } else if (step === 'trees') {
      trackFieldInteract('/sell', 5, 'next_button', false)
    } else if (step === 'lead-capture') {
      trackFieldInteract('/sell', 7, 'next_button', false)
    }

    wentNext.current = false;

    const duration = (Date.now() - stepEnteredAt.current) / 1000
    if (duration > 1) {
      trackStepTiming('/sell', stepIndexes[prevStepRef.current] || 0, prevStepRef.current, duration)
    }
    stepEnteredAt.current = Date.now()
    prevStepRef.current = step

    trackEvent('wizard_step', '/sell', { step_index: stepIndexes[step] || 0, step_name: step })
  }, [step])

  useEffect(() => {
    resetSessionId('/sell')
    const startTime = Date.now()

    const handleUnload = () => {
      const currentStep = stepRef.current
      if (!wentNext.current && currentStep !== 'results' && currentStep !== 'queued') {
        const stepIndexes: Record<string, number> = {
          'intro': 1, 'zipcode': 2, 'size': 3, 'plants': 4, 'trees': 5,
          'calculating': 6, 'lead-capture': 7, 'results': 8, 'queued': 9
        }
        trackEvent('wizard_abandon', '/sell', {
          last_step: stepIndexes[currentStep] || 0,
          last_step_name: currentStep,
          time_on_step_secs: Math.round((Date.now() - stepEnteredAt.current) / 1000)
        })

        if (currentStep === 'zipcode') {
          trackFieldInteract('/sell', 2, 'zipcode', !!zipcodeRef.current.trim())
        } else if (currentStep === 'size') {
          trackFieldInteract('/sell', 3, 'garden_size', !!gardenSizeRef.current.trim())
        } else if (currentStep === 'plants') {
          trackFieldInteract('/sell', 4, 'selected_plants', selectedPlantsRef.current.length > 0)
        } else if (currentStep === 'trees') {
          trackFieldInteract('/sell', 5, 'selected_trees', selectedTreesRef.current.length > 0)
        } else if (currentStep === 'lead-capture') {
          trackFieldInteract('/sell', 7, 'name', !!nameRef.current.trim())
          trackFieldInteract('/sell', 7, 'email', !!emailRef.current.trim())
          trackFieldInteract('/sell', 7, 'phone', !!phoneRef.current.trim())
        }
      }
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      const currentStep = stepRef.current
      if (!wentNext.current && currentStep !== 'results' && currentStep !== 'queued') {
        const duration = (Date.now() - startTime) / 1000
        if (duration < 0.5) return

        const stepIndexes: Record<string, number> = {
          'intro': 1, 'zipcode': 2, 'size': 3, 'plants': 4, 'trees': 5,
          'calculating': 6, 'lead-capture': 7, 'results': 8, 'queued': 9
        }
        trackEvent('wizard_abandon', '/sell', {
          last_step: stepIndexes[currentStep] || 0,
          last_step_name: currentStep,
          time_on_step_secs: Math.round((Date.now() - stepEnteredAt.current) / 1000)
        })

        if (currentStep === 'zipcode') {
          trackFieldInteract('/sell', 2, 'zipcode', !!zipcodeRef.current.trim())
        } else if (currentStep === 'size') {
          trackFieldInteract('/sell', 3, 'garden_size', !!gardenSizeRef.current.trim())
        } else if (currentStep === 'plants') {
          trackFieldInteract('/sell', 4, 'selected_plants', selectedPlantsRef.current.length > 0)
        } else if (currentStep === 'trees') {
          trackFieldInteract('/sell', 5, 'selected_trees', selectedTreesRef.current.length > 0)
        } else if (currentStep === 'lead-capture') {
          trackFieldInteract('/sell', 7, 'name', !!nameRef.current.trim())
          trackFieldInteract('/sell', 7, 'email', !!emailRef.current.trim())
          trackFieldInteract('/sell', 7, 'phone', !!phoneRef.current.trim())
        }
      }
    }
  }, [])


  const loadingMessages = [
    "Analyzing climate data for your zipcode...",
    "Calculating expected amateur yields for your specific plant varieties...",
    "Checking local organic market prices in your area...",
    "Estimating your annual backyard earnings...",
    "Finalizing your personalized CasaGrown report..."
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
    // Capture tracking data on mount
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
        const loadReport = async () => {
          try {
            const { data } = await supabase.from('crm_leads').select('metadata, email, name').eq('id', leadId).single();
            if (data && data.metadata?.ai_estimate_result) {
              setResults(data.metadata.ai_estimate_result);
              setEmail(data.email || '');
              setName(data.name || '');
              setStep('results');
            }
          } catch (err) {
            console.error("Failed to load existing report:", err);
          } finally {
            setIsLoading(false);
          }
        };
        loadReport();
      }
    }
  }, []);

  // Results State
  const [results, setResults] = useState<{
    excess_produce: string;
    estimated_annual_earnings: number;
    analogies: string[];
    reasoning: string;
  } | null>(null)
  

  const toggleSelection = (item: string, list: string[], setList: (l: string[]) => void) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item))
    } else {
      setList([...list, item])
    }
  }

  const handleCalculate = async () => {
    trackFieldInteract('/sell', 4, 'next_button', true)
    wentNext.current = true
    setStep('calculating')
    // Just wait 1.5 seconds for the UI, then show the lead capture form
    setTimeout(() => {
      setStep('lead-capture')
    }, 1500)
  }

  const handleLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email) return
    
    setIsLoading(true)
    trackFieldInteract('/sell', 7, 'next_button', true)
    
    try {
      const supabase = createClient()
      
      const finalPlants = [
        ...selectedPlants.filter(p => p !== 'Other').map(p => `${p} (x${plantQuantities[p] || 1})`),
        ...customPlantsList.filter(c => c.name.trim()).map(c => `${c.name.trim()} (x${c.qty || 1})`)
      ]
      
      const finalTrees = [
        ...selectedTrees.filter(t => t !== 'Other' && t !== 'None').map(t => `${t} (x${treeQuantities[t] || 1})`),
        ...customTreesList.filter(c => c.name.trim()).map(c => `${c.name.trim()} (x${c.qty || 1})`)
      ]

      let finalData = null;
      
      try {
        const { data, error } = await supabase.functions.invoke('estimate-earnings', {
          body: {
            zipcode,
            size: gardenSize,
            plants: finalPlants,
            trees: finalTrees,
            lead: { 
              name, 
              email, 
              phone, 
              marketingConsent,
              ...trackingData 
            }
          }
        })
        
        if (error) throw error
        if (data && data.error) throw new Error(data.error)
        
        if (data && data.queued) {
          wentNext.current = true
          setStep('queued')
          return
        }
        
        if (data && data.ai_estimate_result) {
          finalData = data.ai_estimate_result
        }
      } catch (invokeErr) {
        console.error("Backend request failed:", invokeErr)
        if (!finalData) {
          // Function timed out or failed — show queued state so user still gets an email
          wentNext.current = true
          setStep('queued')
          return
        }
      }
      
      if (finalData) {
        setResults(finalData)
        wentNext.current = true
        setStep('results')
      } else {
        wentNext.current = true
        setStep('queued')
      }
    } catch (err) {
      console.error("Failed to generate report", err)
      setErrorMsg("We're currently experiencing high demand and couldn't generate your report right away. Please try again in a moment!")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="casagrown-promo-page">
      {/* Navbar */}
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

      {/* Dynamic Background */}
      <div className="promo-bg-layer" style={{ backgroundImage: "url('/tote-bag-hero.png')" }}>
        <div className="promo-bg-overlay"></div>
      </div>

      <div className="promo-content-wrapper">
        <div className="promo-main-glass">
          
          {/* Left Hero Content */}
          <div className="promo-hero-section">
            <h1 className="promo-headline">Turn your backyard harvest into community connection.</h1>
            <div className="promo-description">
              <p>8 out of 10 of your neighbors are looking for exactly what you're growing. According to national data from the <strong>USDA</strong> and the <strong>Farmers Market Coalition</strong>, 80% of consumers now prefer local food — creating a massive, untapped opportunity for residential growers.</p>
            </div>
          </div>

          {/* Right Questionnaire Section */}
          <div className="promo-form-section">
            <div className="dynamic-form">
              
              {step === 'intro' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Estimate My Potential</h2>
                  <p className="form-subheading">Wondering what your bounty is worth? Let's do the math in 30 seconds.</p>
                  <button onClick={() => { wentNext.current = true; setStep('zipcode') }} className="btn-action">
                    Get My Estimate →
                  </button>
                </div>
              )}

              {step === 'zipcode' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Where is your garden?</h2>
                  <p className="form-subheading">We use this to estimate local market demand.</p>
                  <div className="input-group">
                    <label>Zipcode</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 90210" 
                      value={zipcode}
                      onChange={e => setZipcode(e.target.value)}
                      onBlur={() => trackFieldInteract('/sell', 2, 'zipcode', !!zipcode.trim())}
                      maxLength={5}
                      autoFocus
                    />
                  </div>
                  <button 
                    disabled={zipcode.length < 5}
                    onClick={() => {
                      trackFieldInteract('/sell', 2, 'next_button', true)
                      wentNext.current = true
                      setStep('size')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {step === 'size' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">How big is your growing space?</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {['A few pots / Balcony', '1-2 Raised Beds', 'Large Backyard Garden', 'Small Acreage / Mini Farm'].map(sz => (
                      <label key={sz} className="checkbox-wrap" style={{ margin: 0 }}>
                        <input 
                          type="radio" 
                          name="size"
                          checked={gardenSize === sz}
                          onChange={() => {
                            setGardenSize(sz)
                            trackFieldInteract('/sell', 3, 'garden_size', true)
                          }}
                        />
                        <span className="checkbox-text">{sz}</span>
                      </label>
                    ))}
                  </div>
                  <button 
                    disabled={!gardenSize}
                    onClick={() => {
                      trackFieldInteract('/sell', 3, 'next_button', true)
                      wentNext.current = true
                      setStep('trees')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {step === 'plants' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">What plants are you growing?</h2>
                  <p className="form-subheading">Select all that apply.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {['Tomatoes', 'Peppers', 'Leafy Greens', 'Root Veggies', 'Herbs', 'Squash / Zucchini', 'Other'].map(plant => {
                      const isSelected = selectedPlants.includes(plant)
                      return (
                        <div key={plant} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label className="checkbox-wrap" style={{ margin: 0, padding: '12px', height: '100%' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelection(plant, selectedPlants, setSelectedPlants)}
                            />
                            <span className="checkbox-text" style={{ fontSize: '0.85rem' }}>{plant}</span>
                          </label>
                          {isSelected && plant !== 'Other' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '12px' }}>
                              <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 600 }}>Qty:</span>
                              <input 
                                type="text" 
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={plantQuantities[plant] !== undefined ? plantQuantities[plant] : 1}
                                onChange={(e) => setPlantQuantities(prev => ({ ...prev, [plant]: e.target.value.replace(/[^0-9]/g, '') }))}
                                style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', textAlign: 'center' }}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {selectedPlants.includes('Other') && (
                     <div className="fade-in-up" style={{ marginBottom: '24px', background: '#f9fafb', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: '#374151' }}>Custom Plants</h4>
                      {customPlantsList.map((cp, idx) => (
                        <div key={cp.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="e.g. Radishes" 
                            value={cp.name}
                            onChange={e => setCustomPlantsList(prev => prev.map(p => p.id === cp.id ? { ...p, name: e.target.value } : p))}
                            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                            autoFocus={idx === customPlantsList.length - 1}
                          />
                          <input 
                            type="text" 
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={cp.qty !== undefined ? cp.qty : 1}
                            onChange={e => setCustomPlantsList(prev => prev.map(p => p.id === cp.id ? { ...p, qty: e.target.value.replace(/[^0-9]/g, '') } : p))}
                            style={{ width: '60px', padding: '8px', borderRadius: '8px', border: '1px solid #d1d5db', textAlign: 'center' }}
                          />
                          <button 
                            type="button" 
                            onClick={() => setCustomPlantsList(prev => prev.filter(p => p.id !== cp.id))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 8px', fontSize: '1.2rem' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        type="button"
                        onClick={() => setCustomPlantsList(prev => [...prev, { id: Math.random().toString(), name: '', qty: 1 }])}
                        style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginTop: '4px' }}
                      >
                        + Add another plant
                      </button>
                    </div>
                  )}
                  {errorMsg && <div className="form-error-banner" style={{ marginBottom: 16 }}>{errorMsg}</div>}
                  <button 
                    onClick={handleCalculate} 
                    className="btn-action"
                  >
                    Estimate My Potential
                  </button>
                </div>
              )}

              {step === 'trees' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Any fruit trees?</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {['Citrus (Lemons, Oranges)', 'Stone Fruit (Peaches, Plums)', 'Avocados', 'Apples / Pears', 'Berries / Vines', 'None', 'Other'].map(tree => {
                      const isSelected = selectedTrees.includes(tree)
                      return (
                        <div key={tree} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label className="checkbox-wrap" style={{ margin: 0, padding: '12px', height: '100%' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelection(tree, selectedTrees, setSelectedTrees)}
                            />
                            <span className="checkbox-text" style={{ fontSize: '0.85rem' }}>{tree}</span>
                          </label>
                          {isSelected && tree !== 'Other' && tree !== 'None' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '12px' }}>
                              <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 600 }}>Qty:</span>
                              <input 
                                type="text" 
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={treeQuantities[tree] !== undefined ? treeQuantities[tree] : 1}
                                onChange={(e) => setTreeQuantities(prev => ({ ...prev, [tree]: e.target.value.replace(/[^0-9]/g, '') }))}
                                style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', textAlign: 'center' }}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {selectedTrees.includes('Other') && (
                    <div className="fade-in-up" style={{ marginBottom: '24px', background: '#f9fafb', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: '#374151' }}>Custom Trees</h4>
                      {customTreesList.map((ct, idx) => (
                        <div key={ct.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="e.g. Figs" 
                            value={ct.name}
                            onChange={e => setCustomTreesList(prev => prev.map(t => t.id === ct.id ? { ...t, name: e.target.value } : t))}
                            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                            autoFocus={idx === customTreesList.length - 1}
                          />
                          <input 
                            type="text" 
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={ct.qty !== undefined ? ct.qty : 1}
                            onChange={e => setCustomTreesList(prev => prev.map(t => t.id === ct.id ? { ...t, qty: e.target.value.replace(/[^0-9]/g, '') } : t))}
                            style={{ width: '60px', padding: '8px', borderRadius: '8px', border: '1px solid #d1d5db', textAlign: 'center' }}
                          />
                          <button 
                            type="button" 
                            onClick={() => setCustomTreesList(prev => prev.filter(t => t.id !== ct.id))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 8px', fontSize: '1.2rem' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        type="button"
                        onClick={() => setCustomTreesList(prev => [...prev, { id: Math.random().toString(), name: '', qty: 1 }])}
                        style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginTop: '4px' }}
                      >
                        + Add another tree
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => {
                      trackFieldInteract('/sell', 5, 'next_button', true)
                      wentNext.current = true
                      setStep('plants')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {step === 'calculating' && (
                <div className="promo-loading fade-in-up" style={{ height: '300px' }}>
                  <div className="spinner"></div>
                  <div>Calculating your backyard's potential...</div>
                </div>
              )}

              {step === 'lead-capture' && (
                <form onSubmit={handleLeadCapture} className="fade-in-up">
                  <h2 className="form-heading">Your report is ready!</h2>
                  <p className="form-subheading">Where should we send your personalized CasaGrown earnings estimate?</p>
                  
                  <div className="input-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Jane Doe" 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onBlur={() => trackFieldInteract('/sell', 7, 'name', !!name.trim())}
                    />
                  </div>
                  <div className="input-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      required 
                      placeholder="hello@example.com" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onBlur={() => trackFieldInteract('/sell', 7, 'email', !!email.trim())}
                    />
                  </div>
                  <div className="input-group">
                    <label>Phone Number (optional)</label>
                    <input 
                      type="tel" 
                      placeholder="(555) 555-5555" 
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onBlur={() => trackFieldInteract('/sell', 7, 'phone', !!phone.trim())}
                    />
                  </div>
                  
                  <label className="checkbox-wrap" style={{ marginBottom: '24px' }}>
                    <input 
                      type="checkbox" 
                      required
                      checked={marketingConsent}
                      onChange={e => setMarketingConsent(e.target.checked)}
                    />
                    <div className="checkbox-text" style={{ fontSize: '0.85rem' }}>
                      <strong>I agree to receive my report and marketing communications</strong>
                      <div style={{ marginTop: '4px', color: '#6b7280', lineHeight: 1.4 }}>
                        By checking this box, you consent to receive SMS and email marketing messages from CasaGrown. Reply STOP to cancel SMS. Msg & data rates may apply.
                      </div>
                    </div>
                  </label>

                  <button 
                    type="submit" 
                    className="btn-action" 
                    style={{ opacity: isLoading ? 0.7 : 1, transition: 'all 0.3s' }} 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <span className="spinner" style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                        <span style={{ fontSize: '0.9rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {loadingMessages[loadingMsgIdx]}
                        </span>
                      </span>
                    ) : (
                      "Send My Report →"
                    )}
                  </button>
                </form>
              )}

              {step === 'results' && results && (
                <div className="fade-in-up" style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#14532d', marginBottom: '8px' }}>Your Backyard Potential</h2>
                  <p style={{ fontSize: '1.05rem', color: '#4b5563', marginBottom: '24px' }}>
                    We've emailed a copy of this report to {email}.
                  </p>
                  
                  <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(22,163,74,0.1))', padding: '32px 20px', borderRadius: '24px', marginBottom: '24px', border: '1px solid rgba(34,197,94,0.3)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -20, right: -20, fontSize: '6rem', opacity: 0.1 }}>🌿</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '1rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Estimated Annual Earnings</div>
                      <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, border: '1px solid #bbf7d0' }}>AI ESTIMATED</span>
                    </div>
                    <div style={{ fontSize: '4.5rem', fontWeight: 900, color: '#14532d', lineHeight: 1, marginBottom: '16px' }}>
                      ${results.estimated_annual_earnings}
                    </div>
                    <p style={{ fontSize: '0.95rem', color: '#166534', lineHeight: 1.5, margin: '0 auto', maxWidth: '80%', fontStyle: 'italic', opacity: 0.9 }}>
                      {results.reasoning}
                    </p>
                  </div>

                  <div style={{ textAlign: 'left', background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', color: '#1f2937', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🍅</span> Projected Yield
                    </h3>
                    <p style={{ color: '#4b5563', lineHeight: 1.6 }}>{results.excess_produce}</p>
                  </div>

                  <div style={{ background: '#f0fdf4', padding: '24px', borderRadius: '16px', marginBottom: '32px', border: '1px solid #bbf7d0', textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ fontSize: '1.8rem' }}>🎯</div>
                      <p style={{ fontSize: '1.1rem', color: '#166534', fontWeight: 600, margin: 0, paddingTop: '4px' }}>
                        That's enough extra cash per year to pay for:
                      </p>
                    </div>
                    <ul style={{ margin: '0 0 0 46px', padding: 0, listStyleType: 'none', color: '#15803d', fontStyle: 'italic', lineHeight: 1.6 }}>
                      {(results.analogies || []).map((analogy, i) => (
                        <li key={i} style={{ marginBottom: '8px', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '-20px' }}>•</span> {analogy}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link 
                    href={`/create-listing?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`} 
                    className="btn-action" 
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    Start Selling on CasaGrown →
                  </Link>
                </div>
              )}

              {step === 'queued' && (
                <div className="fade-in-up" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '16px' }}>📩</div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#14532d', marginBottom: '16px', lineHeight: 1.2 }}>
                    Your Report is On Its Way!
                  </h2>
                  <p style={{ fontSize: '1.1rem', color: '#166534', marginBottom: '16px', lineHeight: 1.6 }}>
                    Our AI is analyzing local market data for your specific garden. We'll email your personalized earnings estimate to <strong>{email}</strong> shortly.
                  </p>
                  <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '32px', lineHeight: 1.6, background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    💡 <strong>Don't wait for the report to start earning!</strong> You can create your listing right now — it only takes 2 minutes. Your neighbors are looking for exactly what you're growing.
                  </p>
                  
                  <Link 
                    href={`/create-listing?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`} 
                    className="btn-action" 
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    Create My Listing Now →
                  </Link>
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '12px' }}>
                    Your report will be in your inbox by the time your listing is live!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vanilla CSS reused from promotional pages */}
      <style jsx global>{`
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
        .nav-tagline { font-weight: 600; font-size: 0.95rem; color: #166534; letter-spacing: 0.5px; border-left: 2px solid #bbf7d0; padding-left: 20px; }

        .promo-content-wrapper {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 60px 24px;
        }

        .promo-main-glass {
          display: flex;
          flex-direction: row;
          background: rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 32px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.15);
          max-width: 1100px;
          width: 100%;
          overflow: hidden;
        }

        .promo-hero-section {
          flex: 1.2;
          padding: 60px;
          background: rgba(220, 252, 231, 0.5);
          border-right: 1px solid rgba(255,255,255,0.5);
        }
        .promo-form-section {
          flex: 1;
          padding: 60px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .promo-headline { font-size: 3.5rem; font-weight: 800; color: #14532d; line-height: 1.1; margin-bottom: 24px; letter-spacing: -1.5px; }
        .promo-description { font-size: 1.15rem; color: #166534; line-height: 1.6; }
        
        .incentive-item { display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.85); padding: 20px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); }
        .incentive-icon { font-size: 2.5rem; }
        .incentive-text strong { display: block; font-size: 1.1rem; color: #166534; margin-bottom: 4px; }
        .incentive-text p { font-size: 0.95rem; color: #4b5563; margin: 0; line-height: 1.4; }

        .dynamic-form { display: flex; flex-direction: column; background: white; padding: 40px; border-radius: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.05); }
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
          .promo-hero-section { padding: 40px 24px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.5); }
          .promo-form-section { padding: 40px 24px; }
          .promo-headline { font-size: 2.5rem; }
          .casagrown-nav { padding: 16px 24px; }
          .nav-tagline { display: none; }
        }
      `}</style>
    </div>
  )
}
