'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { trackEvent, trackFieldInteract, trackStepTiming, resetSessionId, trackMetaLead } from '../../../lib/crm-analytics'

export default function SellLandingPage() {

  const [step, setStep] = useState<'intro' | 'zipcode' | 'size' | 'trees' | 'plants' | 'habits' | 'intent' | 'calculating' | 'lead-capture' | 'results' | 'queued'>('intro')

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
  const [excessHandling, setExcessHandling] = useState('')
  const [sellingComfort, setSellingComfort] = useState('')
  
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


  const loadingSteps = [
    { pct: 15, text: "Analyzing climate & soil data for your zipcode..." },
    { pct: 30, text: "Calculating amateur yields for crop counts..." },
    { pct: 50, text: "Checking local organic market prices..." },
    { pct: 70, text: "Finalizing personalized CasaGrown report..." },
    { pct: 80, text: "Almost there, running enhanced analysis..." },
    { pct: 88, text: "Taking a bit longer, using our deep analysis model..." },
    { pct: 94, text: "Hang tight, crunching the final numbers..." },
    { pct: 97, text: "Just a few more seconds..." },
  ]
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [showEmailForm, setShowEmailForm] = useState(false)

  const saveSellDraft = (extraData?: { name?: string; phone?: string; marketingConsent?: boolean }) => {
    try {
      const draft = {
        zipcode,
        gardenSize,
        selectedPlants,
        selectedTrees,
        plantQuantities,
        treeQuantities,
        customPlantsList,
        customTreesList,
        excessHandling,
        sellingComfort,
        name: extraData?.name || name,
        phone: extraData?.phone || phone,
        marketingConsent: extraData?.marketingConsent ?? marketingConsent,
      }
      localStorage.setItem('casagrown_sell_draft', JSON.stringify(draft))
    } catch {}
  }

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingMsgIdx(prev => Math.min(prev + 1, loadingSteps.length - 1))
      }, 2500)
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
      const isAutostart = params.get('autostart') === '1';

      if (isAutostart) {
        try {
          const rawDraft = localStorage.getItem('casagrown_sell_draft');
          if (rawDraft) {
            const draft = JSON.parse(rawDraft);
            if (draft.zipcode) setZipcode(draft.zipcode);
            if (draft.gardenSize) setGardenSize(draft.gardenSize);
            if (draft.selectedPlants) setSelectedPlants(draft.selectedPlants);
            if (draft.selectedTrees) setSelectedTrees(draft.selectedTrees);
            if (draft.plantQuantities) setPlantQuantities(draft.plantQuantities);
            if (draft.treeQuantities) setTreeQuantities(draft.treeQuantities);
            if (draft.customPlantsList) setCustomPlantsList(draft.customPlantsList);
            if (draft.customTreesList) setCustomTreesList(draft.customTreesList);
            if (draft.excessHandling) setExcessHandling(draft.excessHandling);
            if (draft.sellingComfort) setSellingComfort(draft.sellingComfort);

            const supabase = createClient();
            let resumed = false;

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

            // Use onAuthStateChange to capture session (getSession returns null
            // because Supabase clears internal state during token refresh after init).
            // Use direct fetch() for the edge function call instead of functions.invoke()
            // to avoid deadlocking on Supabase client's internal init state.
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
              if (resumed) return;
              if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user?.email) {
                subscription.unsubscribe();
                resumed = true;
                const u = session.user;
                const uEmail = u.email;
                const uName = u.user_metadata?.full_name || u.user_metadata?.name || draft.name || 'Grower';

                setEmail(uEmail);
                setName(uName);
                if (draft.phone) setPhone(draft.phone);
                localStorage.removeItem('casagrown_sell_draft');

                setIsLoading(true);
                setStep('calculating');

                const rawP = (draft.selectedPlants || []).filter((p: string) => p !== 'Other');
                const rawT = (draft.selectedTrees || []).filter((t: string) => t !== 'Other' && t !== 'None');
                const customP = (draft.customPlantsList || []).filter((c: any) => c.name?.trim()).map((c: any) => c.name.trim());
                const customT = (draft.customTreesList || []).filter((c: any) => c.name?.trim()).map((c: any) => c.name.trim());
                const allCrops = [...rawP, ...customP, ...rawT, ...customT];

                if (allCrops.length > 0) {
                  fetch('/api/interest/submit', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                      name: uName,
                      email: uEmail,
                      phone: draft.phone || '',
                      zipcodes: [draft.zipcode || '95125'],
                      interests: allCrops.map(crop => ({ produce_name: crop, interest_type: 'sell' }))
                    })
                  }).catch(() => {});
                }

                const finalPlants = [
                  ...rawP.map((p: string) => `${p} (x${draft.plantQuantities?.[p] || 1})`),
                  ...(draft.customPlantsList || []).filter((c: any) => c.name?.trim()).map((c: any) => `${c.name.trim()} (x${c.qty || 1})`)
                ];

                const finalTrees = [
                  ...rawT.map((t: string) => `${t} (x${draft.treeQuantities?.[t] || 1})`),
                  ...(draft.customTreesList || []).filter((c: any) => c.name?.trim()).map((c: any) => `${c.name.trim()} (x${c.qty || 1})`)
                ];

                const payload = {
                  zipcode: draft.zipcode || '95125',
                  size: draft.gardenSize || 'Medium',
                  plants: finalPlants,
                  trees: finalTrees,
                  excess_handling: draft.excessHandling,
                  selling_comfort: draft.sellingComfort,
                  lead: { name: uName, email: uEmail, phone: draft.phone, marketingConsent: draft.marketingConsent }
                };

                try {
                  const resp = await fetch(`${supabaseUrl}/functions/v1/estimate-earnings`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session.access_token}`,
                      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    },
                    body: JSON.stringify(payload)
                  });
                  const data = await resp.json();
                  if (data?.ai_estimate_result) {
                    setResults(data.ai_estimate_result);
                    setStep('results');
                  } else {
                    setStep('queued');
                  }
                } catch (e) {
                  console.error('[SellPage] Edge function error:', e);
                  setStep('queued');
                }
                setIsLoading(false);
              }
            });

            // Safety timeout: clean up listener if nothing fires after 10s
            setTimeout(() => { if (!resumed) subscription.unsubscribe(); }, 10000);
          }
        } catch (e) {
          console.error('[SellPage] Failed to resume draft:', e);
        }
      } else if (leadId) {
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
    setStep('lead-capture')
  }

  const handleLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Please enter your full name above to proceed.')
      return
    }
    if (!email.trim()) {
      setErrorMsg('Please enter your email address above to view your report.')
      return
    }
    
    setIsLoading(true)
    setErrorMsg('')
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

      // Auto-register sell interests for captured lead
      const rawPlants = selectedPlants.filter(p => p !== 'Other')
      const rawTrees = selectedTrees.filter(t => t !== 'Other' && t !== 'None')
      const customPlantNames = customPlantsList.filter(c => c.name.trim()).map(c => c.name.trim())
      const customTreeNames = customTreesList.filter(c => c.name.trim()).map(c => c.name.trim())

      const allCrops = [...rawPlants, ...customPlantNames, ...rawTrees, ...customTreeNames]
      if (allCrops.length > 0) {
        fetch('/api/interest/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone,
            zipcodes: [zipcode || '95125'],
            interests: allCrops.map(crop => ({ produce_name: crop, interest_type: 'sell' })),
            utm_source: trackingData.utm_source,
            utm_medium: trackingData.utm_medium,
            utm_campaign: trackingData.utm_campaign,
            utm_content: trackingData.utm_content,
          })
        }).catch(err => console.error("Failed to submit sell interests:", err))
      }

      let finalData = null;
      
      try {
        const payload = {
          zipcode,
          size: gardenSize,
          plants: finalPlants,
          trees: finalTrees,
          excess_handling: excessHandling,
          selling_comfort: sellingComfort,
          lead: { 
            name, 
            email, 
            phone, 
            marketingConsent,
            ...trackingData 
          }
        }

        let { data, error } = await supabase.functions.invoke('estimate-earnings', { body: payload })

        if (!error) {
          trackMetaLead('sell_backyard_calculator', { force: true })
        }

        if (!error && data?.queued) {
          wentNext.current = true
          setStep('queued')
          return
        }
        
        if (data && data.ai_estimate_result) {
          finalData = data.ai_estimate_result
        }
      } catch (invokeErr) {
        console.error("[SellPage] Edge function invoke failed:", invokeErr)
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
    <div className="casagrown-promo-page" style={{ backgroundColor: '#0a0f09' }}>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.style.backgroundColor='#0a0f09';if(document.body)document.body.style.backgroundColor='#0a0f09';`
        }}
      />
      {/* Navbar */}
      <nav className="casagrown-nav">
        <div className="nav-left">
          <Link href="/" className="nav-brand">
            <img src="/logo.png" alt="CasaGrown" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain' }} />
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
      <div className="promo-bg-layer">
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
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '12px', border: '1px solid #bbf7d0' }}>
                    <span>✨</span> Free Backyard Calculator • 90 Seconds
                  </div>
                  <h2 className="form-heading">Estimate Your Backyard Potential</h2>
                  <p className="form-subheading">See exactly what your garden could be earning this season. Takes 90 seconds. Free. No commitment required.</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>$820</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Avg / Year</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>11.5B</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>lbs Wasted</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>90s</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Free Result</div>
                    </div>
                  </div>

                  <button onClick={() => { wentNext.current = true; setStep('zipcode') }} className="btn-action">
                    Calculate My Backyard's Value →
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
                    onClick={() => {
                      trackFieldInteract('/sell', 4, 'next_button', true)
                      wentNext.current = true
                      setStep('habits')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {step === 'habits' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">How do you handle excess produce?</h2>
                  <p className="form-subheading">This helps us calculate your local food waste impact.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {[
                      'Give it away to friends & neighbors',
                      'It mostly goes to waste or compost',
                      'Tried selling on Facebook Marketplace or Nextdoor',
                      'Preserve it (jam, pickles, freeze)'
                    ].map(h => (
                      <label key={h} className="checkbox-wrap" style={{ margin: 0 }}>
                        <input 
                          type="radio" 
                          name="habits"
                          checked={excessHandling === h}
                          onChange={() => setExcessHandling(h)}
                        />
                        <span className="checkbox-text">{h}</span>
                      </label>
                    ))}
                  </div>
                  <button 
                    disabled={!excessHandling}
                    onClick={() => {
                      wentNext.current = true
                      setStep('intent')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {step === 'intent' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Comfort with selling to neighbors?</h2>
                  <p className="form-subheading">CasaGrown handles payments and pickup notifications for you.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {[
                      'Very comfortable — I want to earn extra income!',
                      'Open to it if it is easy and safe',
                      'Hesitant — I have privacy/security questions',
                      'Only interested in gifting or trading'
                    ].map(c => (
                      <label key={c} className="checkbox-wrap" style={{ margin: 0 }}>
                        <input 
                          type="radio" 
                          name="intent"
                          checked={sellingComfort === c}
                          onChange={() => setSellingComfort(c)}
                        />
                        <span className="checkbox-text">{c}</span>
                      </label>
                    ))}
                  </div>
                  <button 
                    disabled={!sellingComfort}
                    onClick={handleCalculate} 
                    className="btn-action"
                  >
                    Calculate My Potential →
                  </button>
                </div>
              )}

              {step === 'trees' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Any fruit trees?</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {['Lemons', 'Limes', 'Oranges', 'Grapefruit', 'Hass Avocados', 'Figs', 'Peaches & Nectarines', 'Plums', 'Cherries', 'Apples', 'Pears', 'Persimmons', 'Pomegranates', 'Strawberries & Berries', 'None', 'Other'].map(tree => {
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
                <div className="fade-in-up">
                  <h2 className="form-heading">Where should we send your earnings estimate report?</h2>
                  <p className="form-subheading">Your personalized CasaGrown earnings estimate and local buyer match recommendations are ready.</p>

                  {/* Top: Name & Phone Inputs */}
                  <div style={{ marginBottom: '16px' }}>
                    {errorMsg && <div className="form-error-banner" style={{ marginBottom: '16px' }}>{errorMsg}</div>}
                    <div className="input-group">
                      <label>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <input 
                        type="text" 
                        required 
                        placeholder="Jane Doe" 
                        value={name}
                        onChange={e => { setName(e.target.value); setErrorMsg('') }}
                        onBlur={() => trackFieldInteract('/sell', 7, 'name', !!name.trim())}
                        autoFocus
                      />
                    </div>

                    <div className="input-group" style={{ marginTop: '12px' }}>
                      <label>Phone Number (optional)</label>
                      <input 
                        type="tel" 
                        placeholder="(555) 555-5555" 
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onBlur={() => trackFieldInteract('/sell', 7, 'phone', !!phone.trim())}
                      />
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="sellMarketingConsentCheck"
                        checked={marketingConsent}
                        onChange={e => setMarketingConsent(e.target.checked)}
                        style={{ accentColor: '#22c55e', width: '16px', height: '16px' }}
                      />
                      <label htmlFor="sellMarketingConsentCheck" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                        I agree to receive local produce buyer alerts & earnings updates.
                      </label>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 16px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    <span>Choose How to Receive Report</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  </div>

                  {/* Responsive Flex Layout & Divider Styles */}
                  <style>{`
                    .options-flex-wrapper {
                      display: flex;
                      flex-direction: column;
                      gap: 16px;
                      margin-bottom: 20px;
                    }
                    .options-col {
                      flex: 1;
                      display: flex;
                      flex-direction: column;
                      gap: 12px;
                    }
                    .desktop-vertical-divider {
                      display: none;
                      width: 1px;
                      background: rgba(255,255,255,0.12);
                      position: relative;
                      margin: 0 4px;
                    }
                    .mobile-horizontal-divider {
                      display: flex;
                      align-items: center;
                      gap: 12px;
                      margin: 4px 0;
                      color: rgba(255,255,255,0.3);
                      font-size: 0.7rem;
                      font-weight: 600;
                    }

                    @media (min-width: 580px) {
                      .options-flex-wrapper {
                        flex-direction: row;
                        align-items: stretch;
                        gap: 20px;
                      }
                      .desktop-vertical-divider {
                        display: block;
                      }
                      .mobile-horizontal-divider {
                        display: none;
                      }
                    }
                  `}</style>

                  {/* Sending Options Row */}
                  <div className="options-flex-wrapper">
                    {/* Left Column: Social Auth CTAs */}
                    <div className="options-col">
                      <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', fontWeight: 600 }}>Instant 1-Tap Access</label>
                      {/* Google OAuth Primary Button */}
                      <button 
                        type="button" 
                        onClick={async () => {
                          saveSellDraft({ name, phone, marketingConsent })
                          const supabase = createClient();
                          await supabase.auth.signInWithOAuth({
                            provider: 'google',
                            options: { redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent('/sell?autostart=1')}` }
                          });
                        }}
                        className={email.trim() ? '' : 'btn-action'}
                        style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                          padding: '14px', borderRadius: '16px', fontWeight: 700, fontSize: '0.88rem', width: '100%',
                          transition: 'all 0.3s',
                          ...(email.trim() ? {
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'white', cursor: 'pointer', boxShadow: 'none'
                          } : {})
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        Continue with Google
                      </button>

                      {/* Apple OAuth Secondary Button */}
                      <button 
                        type="button" 
                        onClick={async () => {
                          saveSellDraft({ name, phone, marketingConsent })
                          const supabase = createClient();
                          await supabase.auth.signInWithOAuth({
                            provider: 'apple',
                            options: { redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent('/sell?autostart=1')}` }
                          });
                        }}
                        style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                          padding: '14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.06)', color: 'white', fontWeight: 700, fontSize: '0.88rem',
                          cursor: 'pointer', transition: 'all 0.3s', width: '100%'
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 170 170" fill="currentColor">
                          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.33.13-9.13-1.9-14.4-6.1-3.32-2.6-7.27-7.27-11.87-14.01-6.19-9.11-11.1-19.53-14.73-31.27-3.63-11.74-5.45-22.95-5.45-33.62 0-14.52 3.63-26.68 10.9-36.48 7.27-9.8 16.59-14.75 27.97-14.87 4.71 0 9.87 1.15 15.48 3.44 5.61 2.29 9.4 3.44 11.37 3.44 1.73 0 5.64-1.2 11.75-3.6 6.11-2.4 11.34-3.53 15.69-3.39 12.33.63 22.38 5.4 30.15 14.31-10.93 6.64-16.27 15.77-16.03 27.39.24 9.17 3.82 16.89 10.74 23.16 6.92 6.27 15.11 9.77 24.58 10.5-.78 4.76-2.02 9.72-3.72 14.88zm-30.82-106.1c0 6.65-2.4 13.06-7.21 19.23-4.8 6.17-10.87 9.88-18.2 11.13-.24-1.12-.36-2.2-.36-3.23 0-6.65 2.51-13.17 7.53-19.56 5.02-6.39 11.08-10.08 18.17-11.07.07 1.17.07 2.34.07 3.5z"/>
                        </svg>
                        Continue with Apple
                      </button>
                    </div>

                    {/* Desktop Vertical Divider (Only on Screens >= 580px) */}
                    <div className="desktop-vertical-divider">
                      <div style={{ 
                        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', 
                        background: '#141e17', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)',
                        fontSize: '0.65rem', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5
                      }}>
                        OR
                      </div>
                    </div>

                    {/* Mobile Horizontal OR Divider */}
                    <div className="mobile-horizontal-divider">
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                      <span>OR</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                    </div>

                    {/* Right Column: Email Input & Submit Button */}
                    <div className="options-col">
                      <form onSubmit={handleLeadCapture} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="input-group">
                          <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', fontWeight: 600 }}>Email Delivery <span style={{ color: '#ef4444' }}>*</span></label>
                          <input 
                            type="email" 
                            required 
                            placeholder="hello@example.com" 
                            value={email} 
                            onChange={e => { setEmail(e.target.value); setErrorMsg('') }}
                            onBlur={() => trackFieldInteract('/sell', 7, 'email', !!email.trim())}
                          />
                        </div>

                        <button 
                          type="submit" 
                          disabled={isLoading} 
                          className={email.trim() ? 'btn-action' : ''}
                          style={{ 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            padding: '14px', borderRadius: '16px', fontWeight: 700, fontSize: '0.88rem',
                            cursor: 'pointer', transition: 'all 0.3s', width: '100%', marginTop: '4px',
                            ...(email.trim() ? {} : {
                              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                              color: 'white', boxShadow: 'none'
                            })
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                          {isLoading ? 'Calculating Estimate...' : 'Continue with email'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
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

                  {/* CTA buttons */}
                  {(() => {
                    const firstCrop = selectedPlants.find(p => p !== 'Other') || selectedTrees.find(t => t !== 'Other' && t !== 'None') || customPlantsList[0]?.name || customTreesList[0]?.name || ''
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Link 
                          href={`/create-listing?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}${firstCrop ? `&produce=${encodeURIComponent(firstCrop)}` : ''}`} 
                          className="btn-action" 
                          style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}
                        >
                          🚀 Create Your First Listing →
                        </Link>
                        <Link 
                          href={`/interest?scope=sell&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&zipcode=${encodeURIComponent(zipcode || '')}${firstCrop ? `&produce=${encodeURIComponent(firstCrop)}` : ''}`} 
                          style={{ 
                            display: 'block', textDecoration: 'none', textAlign: 'center',
                            padding: '18px 32px', borderRadius: '16px', fontSize: '1.15rem', fontWeight: 800,
                            border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', 
                            color: '#22c55e', cursor: 'pointer', transition: 'all 0.3s', width: '100%'
                          }}
                        >
                          🔔 Get Notified When Buyers Want Your Produce
                        </Link>
                      </div>
                    )
                  })()}
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
                  
                  {(() => {
                    const firstCrop = selectedPlants.find(p => p !== 'Other') || selectedTrees.find(t => t !== 'Other' && t !== 'None') || customPlantsList[0]?.name || customTreesList[0]?.name || ''
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Link 
                          href={`/create-listing?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}${firstCrop ? `&produce=${encodeURIComponent(firstCrop)}` : ''}`} 
                          className="btn-action" 
                          style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}
                        >
                          🚀 Create Your First Listing →
                        </Link>
                        <Link 
                          href={`/interest?scope=sell&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&zipcode=${encodeURIComponent(zipcode || '')}${firstCrop ? `&produce=${encodeURIComponent(firstCrop)}` : ''}`} 
                          style={{ 
                            display: 'block', textDecoration: 'none', textAlign: 'center',
                            padding: '18px 32px', borderRadius: '16px', fontSize: '1.15rem', fontWeight: 800,
                            border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', 
                            color: '#22c55e', cursor: 'pointer', transition: 'all 0.3s', width: '100%'
                          }}
                        >
                          🔔 Get Notified When Buyers Want Your Produce
                        </Link>
                      </div>
                    )
                  })()}
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
        
        html, body {
          background-color: #0a0f09 !important;
        }

        .casagrown-promo-page {
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #ffffff;
          background: #0a0f09;
          overflow-x: hidden;
        }

        .promo-bg-layer {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(ellipse 60% 50% at 20% 20%, rgba(34,197,94,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(245,166,35,0.06) 0%, transparent 60%);
          z-index: -2;
        }
        .promo-bg-overlay {
          display: none;
        }

        .casagrown-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          background: rgba(10,15,9,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          z-index: 10;
        }
        .nav-left { display: flex; align-items: center; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #ffffff; letter-spacing: -0.5px; }
        .nav-logo-img { height: 40px; width: auto; }
        .nav-tagline { font-weight: 600; font-size: 0.95rem; color: #4ade80; letter-spacing: 0.5px; border-left: 2px solid rgba(74,222,128,0.4); padding-left: 20px; }

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
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 32px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.4);
          max-width: 1100px;
          width: 100%;
          overflow: hidden;
        }

        .promo-hero-section {
          flex: 1.2;
          padding: 60px;
          background: rgba(255, 255, 255, 0.02);
          border-right: 1px solid rgba(255,255,255,0.08);
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

        .dynamic-form { display: flex; flex-direction: column; background: transparent; padding: 0; }
        .form-heading { font-size: 1.8rem; font-weight: 800; color: #ffffff; margin-bottom: 8px; }
        .form-subheading { font-size: 1.05rem; color: rgba(255,255,255,0.7); margin-bottom: 24px; line-height: 1.5; }
        
        .input-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .input-group label { font-size: 0.95rem; font-weight: 700; color: rgba(255,255,255,0.8); }
        .input-group input { padding: 16px 20px; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; font-size: 1.05rem; background: rgba(255,255,255,0.04); color: white; transition: all 0.2s; }
        .input-group input:focus { outline: none; border-color: #22c55e; background: rgba(255,255,255,0.08); box-shadow: 0 0 0 4px rgba(34,197,94,0.15); }
        
        .checkbox-wrap { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 16px; background: rgba(255,255,255,0.04); border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); transition: all 0.2s; }
        .checkbox-wrap:hover { background: rgba(255,255,255,0.08); }
        .checkbox-wrap input { width: 20px; height: 20px; accent-color: #22c55e; cursor: pointer; }
        .checkbox-text { font-size: 0.95rem; color: rgba(255,255,255,0.9); font-weight: 600; }

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
