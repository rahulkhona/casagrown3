'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { trackEvent, trackFieldInteract, trackStepTiming, resetSessionId, trackMetaLead } from '../../../lib/crm-analytics'

export default function NutritionLossLandingPage() {

  const [step, setStep] = useState<
    'intro' | 'zipcode' | 'produce' | 'store_types' | 'fulfillment' | 'frequency' | 'neighbor_buying' | 'calculating' | 'lead-capture' | 'queued' | 'results'
  >('intro')

  const stepEnteredAt = React.useRef(Date.now())
  const prevStepRef = React.useRef<string>('intro')
  const wentNext = React.useRef(false)
  const stepRef = React.useRef(step)

  // Questionnaire State
  const [zipcode, setZipcode] = useState('')
  const [selectedProduce, setSelectedProduce] = useState<string[]>([])
  
  type CustomItem = { id: string, name: string }
  const [customProduceList, setCustomProduceList] = useState<CustomItem[]>([])
  
  // Buyer Qualification State (1 Question Per Page, Multi-Select Support)
  const [selectedStoreTypes, setSelectedStoreTypes] = useState<string[]>([])
  const [selectedFulfillmentModes, setSelectedFulfillmentModes] = useState<string[]>([])
  const [buyingFrequency, setBuyingFrequency] = useState('')
  const [neighborBuyingComfort, setNeighborBuyingComfort] = useState('')

  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<any>(null)
  const [hasActiveListings, setHasActiveListings] = useState(false)

  // Lead Capture State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const loadingSteps = [
    { pct: 15, text: "Analyzing post-harvest transit times..." },
    { pct: 30, text: "Calculating Vitamin C & nutrient degradation..." },
    { pct: 50, text: "Matching local fresh harvest stands near " + (zipcode || '95125') + "..." },
    { pct: 70, text: "Finalizing personalized nutrition report..." },
    { pct: 80, text: "Almost there, running enhanced analysis..." },
    { pct: 88, text: "Taking a bit longer, using our deep analysis model..." },
    { pct: 94, text: "Hang tight, crunching the final numbers..." },
    { pct: 97, text: "Just a few more seconds..." },
  ]
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [showEmailForm, setShowEmailForm] = useState(false)

  const saveNutritionDraft = (extraData?: { name?: string; phone?: string; marketingConsent?: boolean }) => {
    try {
      const draft = {
        zipcode,
        selectedProduce,
        customProduceList,
        selectedStoreTypes,
        selectedFulfillmentModes,
        buyingFrequency,
        neighborBuyingComfort,
        name: extraData?.name || name,
        phone: extraData?.phone || phone,
        marketingConsent: extraData?.marketingConsent ?? marketingConsent,
      }
      localStorage.setItem('casagrown_nutrition_draft', JSON.stringify(draft))
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

  const selectedProduceRef = React.useRef(selectedProduce)
  const nameRef = React.useRef(name)
  const emailRef = React.useRef(email)
  const phoneRef = React.useRef(phone)

  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    selectedProduceRef.current = selectedProduce
    nameRef.current = name
    emailRef.current = email
    phoneRef.current = phone
  }, [selectedProduce, name, email, phone])

  useEffect(() => {
    const stepIndexes: Record<string, number> = {
      'intro': 1, 'zipcode': 2, 'produce': 3, 'store_types': 4, 'fulfillment': 5, 'frequency': 6, 'neighbor_buying': 7, 'calculating': 8, 'lead-capture': 9, 'queued': 10, 'results': 11
    }

    if (step === 'produce') {
      trackFieldInteract('/check-nutrition-loss', 3, 'next_button', false)
    } else if (step === 'lead-capture') {
      trackFieldInteract('/check-nutrition-loss', 9, 'next_button', false)
    }

    wentNext.current = false;

    const duration = (Date.now() - stepEnteredAt.current) / 1000
    if (duration > 1) {
      trackStepTiming('/check-nutrition-loss', stepIndexes[prevStepRef.current] || 0, prevStepRef.current, duration)
    }
    stepEnteredAt.current = Date.now()
    prevStepRef.current = step

    trackEvent('wizard_step', '/check-nutrition-loss', { step_index: stepIndexes[step] || 0, step_name: step })
  }, [step])

  useEffect(() => {
    resetSessionId('/check-nutrition-loss')

    const handleUnload = () => {
      const currentStep = stepRef.current
      if (!wentNext.current && currentStep !== 'results' && currentStep !== 'queued') {
        const stepIndexes: Record<string, number> = {
          'intro': 1, 'zipcode': 2, 'produce': 3, 'store_types': 4, 'fulfillment': 5, 'frequency': 6, 'neighbor_buying': 7, 'calculating': 8, 'lead-capture': 9, 'queued': 10, 'results': 11
        }
        trackEvent('wizard_abandon', '/check-nutrition-loss', {
          last_step: stepIndexes[currentStep] || 0,
          last_step_name: currentStep,
          time_on_step_secs: Math.round((Date.now() - stepEnteredAt.current) / 1000)
        })

        if (currentStep === 'produce') {
          trackFieldInteract('/check-nutrition-loss', 3, 'selected_produce', selectedProduceRef.current.length > 0)
        } else if (currentStep === 'lead-capture') {
          trackFieldInteract('/check-nutrition-loss', 9, 'name', !!nameRef.current.trim())
          trackFieldInteract('/check-nutrition-loss', 9, 'email', !!emailRef.current.trim())
          trackFieldInteract('/check-nutrition-loss', 9, 'phone', !!phoneRef.current.trim())
        }
      }
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])

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
      const isAutostart = params.get('autostart') === '1';

      if (isAutostart) {
        try {
          const rawDraft = localStorage.getItem('casagrown_nutrition_draft');
            console.log('[NutritionLoss] autostart: draft found?', !!rawDraft);
          if (rawDraft) {
            const draft = JSON.parse(rawDraft);
            if (draft.zipcode) setZipcode(draft.zipcode);
            if (draft.selectedProduce) setSelectedProduce(draft.selectedProduce);
            if (draft.customProduceList) setCustomProduceList(draft.customProduceList);
            if (draft.selectedStoreTypes) setSelectedStoreTypes(draft.selectedStoreTypes);
            if (draft.selectedFulfillmentModes) setSelectedFulfillmentModes(draft.selectedFulfillmentModes);
            if (draft.buyingFrequency) setBuyingFrequency(draft.buyingFrequency);
            if (draft.neighborBuyingComfort) setNeighborBuyingComfort(draft.neighborBuyingComfort);

            const supabase = createClient();
            let resumed = false;

            const resumeWithSession = async (session: any) => {
              if (resumed) return; // prevent double-execution
              resumed = true;
              const u = session?.user;
              const uEmail = u?.email || draft.email || '';
              const uName = u?.user_metadata?.full_name || u?.user_metadata?.name || draft.name || 'Friend';
              
              if (uEmail) {
                setEmail(uEmail);
                setName(uName);
                if (draft.phone) setPhone(draft.phone);
                localStorage.removeItem('casagrown_nutrition_draft');
                
                // Auto-submit lead capture
                setIsLoading(true);
                setStep('calculating');

                const finalProduce = [
                  ...(draft.selectedProduce || []).filter((p: string) => p !== 'Other'),
                  ...(draft.customProduceList || []).filter((c: any) => c.name?.trim()).map((c: any) => c.name.trim())
                ];

                fetch('/api/interest/submit', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
                  },
                  body: JSON.stringify({
                    name: uName,
                    email: uEmail,
                    phone: draft.phone || '',
                    zipcodes: [draft.zipcode || '95125'],
                    interests: finalProduce.map(p => ({ produce_name: p, interest_type: 'buy' })),
                    store_types: draft.selectedStoreTypes,
                    fulfillment_modes: draft.selectedFulfillmentModes,
                    buying_frequency: draft.buyingFrequency,
                    neighbor_buying_comfort: draft.neighborBuyingComfort,
                  })
                }).catch(() => {});

                const { data } = await supabase.functions.invoke('calculate-nutrition-loss', {
                  body: {
                    produce: finalProduce,
                    zipcode: draft.zipcode || '95125',
                    store_types: draft.selectedStoreTypes,
                    fulfillment_modes: draft.selectedFulfillmentModes,
                    buying_frequency: draft.buyingFrequency,
                    lead: { name: uName, email: uEmail, phone: draft.phone }
                  }
                });

                if (data && data.ai_nutrition_result) {
                  setResults(data.ai_nutrition_result);
                  setStep('results');
                } else {
                  setStep('queued');
                }
                setIsLoading(false);
              }
            };

            // Try getSession first (works when cookies are already hydrated)
            (async () => {
              console.log('[NutritionLoss] autostart: attempting getSession...');
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user?.email) {
                console.log('[NutritionLoss] autostart: session found via getSession', session.user.email);
                resumeWithSession(session);
              } else {
                console.log('[NutritionLoss] autostart: no session yet, listening for auth state change...');
                // Fallback: listen for auth events (INITIAL_SESSION or SIGNED_IN)
                const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
                  console.log('[NutritionLoss] autostart: onAuthStateChange event:', event, session?.user?.email);
                  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user?.email) {
                    subscription.unsubscribe();
                    resumeWithSession(session);
                  }
                });
                // Safety timeout: if no auth event after 10s, clean up listener
                setTimeout(() => { if (!resumed) { console.log('[NutritionLoss] autostart: 10s timeout — no session detected'); subscription.unsubscribe(); } }, 10000);
              }
            })();
          }
        } catch (e) {
          console.error('[NutritionLoss] Failed to resume draft:', e);
        }
      } else if (leadId) {
        setIsLoading(true);
        const supabase = createClient();
        const fetchReport = async () => {
          try {
            const { data } = await supabase.from('crm_leads').select('metadata, email, name').eq('id', leadId).single();
            if (data && data.metadata?.ai_nutrition_result) {
              setResults(data.metadata.ai_nutrition_result);
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
        fetchReport();
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

  const toggleStoreType = (st: string) => {
    if (selectedStoreTypes.includes(st)) {
      setSelectedStoreTypes(selectedStoreTypes.filter(s => s !== st))
    } else {
      setSelectedStoreTypes([...selectedStoreTypes, st])
    }
  }

  const toggleFulfillmentMode = (fm: string) => {
    if (selectedFulfillmentModes.includes(fm)) {
      setSelectedFulfillmentModes(selectedFulfillmentModes.filter(m => m !== fm))
    } else {
      setSelectedFulfillmentModes([...selectedFulfillmentModes, fm])
    }
  }

  const handleCalculate = async () => {
    const finalProduce = [
      ...selectedProduce.filter(p => p !== 'Other'),
      ...customProduceList.filter(c => c.name.trim()).map(c => c.name.trim())
    ]
    if (finalProduce.length === 0) {
      setErrorMsg("Please select at least one produce item.")
      return
    }
    setErrorMsg("")
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
    trackFieldInteract('/check-nutrition-loss', 9, 'next_button', true)
    
    try {
      const supabase = createClient()
      
      const finalProduce = [
        ...selectedProduce.filter(p => p !== 'Other'),
        ...customProduceList.filter(c => c.name.trim()).map(c => c.name.trim())
      ]

      // Auto-register buy produce interests for captured lead
      if (finalProduce.length > 0) {
        fetch('/api/interest/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone,
            zipcodes: [zipcode.trim() || '95125'],
            interests: finalProduce.map(p => ({ produce_name: p, interest_type: 'buy' })),
            utm_source: trackingData.utm_source,
            utm_medium: trackingData.utm_medium,
            utm_campaign: trackingData.utm_campaign,
            utm_content: trackingData.utm_content,
            store_types: selectedStoreTypes,
            fulfillment_modes: selectedFulfillmentModes,
            buying_frequency: buyingFrequency,
            neighbor_buying_comfort: neighborBuyingComfort,
          })
        }).catch(err => console.error("Failed to auto-register buy interests:", err))
      }

      const payload = {
        produce: finalProduce,
        lead: { 
          name, 
          email, 
          phone, 
          zipcode: zipcode.trim() || '95125',
          store_types: selectedStoreTypes,
          fulfillment_modes: selectedFulfillmentModes,
          buying_frequency: buyingFrequency,
          neighbor_buying_comfort: neighborBuyingComfort,
          marketingConsent,
          ...trackingData 
        }
      }

      let { data, error } = await supabase.functions.invoke('estimate-nutrition-loss', { body: payload })
      
      if (!error) {
        trackMetaLead('buyer_nutrition_report', { force: true })
      }

      // Check marketplace for active produce listings
      try {
        const { data: activeListings } = await supabase
          .from('market_products')
          .select('id')
          .eq('status', 'active')
          .limit(1)
        if (activeListings && activeListings.length > 0) {
          setHasActiveListings(true)
        }
      } catch (mErr) {
        console.warn("Marketplace listings check failed:", mErr)
      }

      if (!error && data?.queued) {
        wentNext.current = true
        setStep('queued')
        return
      }

      if (data && data.ai_nutrition_result) {
        const resObj = data.ai_nutrition_result
        setResults(resObj)
        wentNext.current = true
        setStep('results')
        return
      }
      
      wentNext.current = true
      setStep('queued')
    } catch (err) {
      console.error("Failed to generate report", err)
      wentNext.current = true
      setStep('queued')
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
      <nav className="casagrown-nav">
        <div className="nav-left">
          <Link href="/" className="nav-brand">
            <img src="/logo.png" alt="CasaGrown" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain' }} />
            <span className="nav-brand-name">CasaGrown</span>
          </Link>
          <span className="nav-tagline">Fresh. Local. Trusted.</span>
        </div>
        <div>
          <Link href="/login" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#4ade80', textDecoration: 'none' }}>
            Log In
          </Link>
        </div>
      </nav>

      <div className="promo-bg-layer">
        <div className="promo-bg-overlay"></div>
      </div>

      <div className="promo-content-wrapper">
        <div className="promo-main-glass">
          
          {/* Left Hero Section (Only rendered on the opening intro step) */}
          {step === 'intro' && (
            <div className="promo-hero-section fade-in-up">
              <h1 className="promo-headline">The Post-Harvest Nutrient Gap</h1>
              <div className="promo-description">
                <p style={{ marginBottom: '16px', fontSize: '1rem', color: 'rgba(255,255,255,0.7)' }}>Store-bought produce loses up to 50% of its vitamins between harvest and retail shelves. Learn how your family's grocery list is impacted.</p>
                
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 style={{ color: '#4ade80', fontSize: '0.95rem', fontWeight: 700, marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>Est. Nutrient Loss (Harvest To Shelf)</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left' }}>
                        <th style={{ padding: '6px' }}>Produce</th>
                        <th style={{ padding: '6px' }}>Loss %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td style={{ padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>🥬 Spinach</td><td style={{ padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f87171', fontWeight: 'bold' }}>50% - 80%</td></tr>
                      <tr><td style={{ padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>🥦 Broccoli</td><td style={{ padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#fbbf24', fontWeight: 'bold' }}>25% - 55%</td></tr>
                      <tr><td style={{ padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>🍓 Strawberries</td><td style={{ padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#fbbf24', fontWeight: 'bold' }}>30% - 40%</td></tr>
                      <tr><td style={{ padding: '6px' }}>🍎 Apples</td><td style={{ padding: '6px', color: '#f87171', fontWeight: 'bold' }}>25% - 50%</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Right Questionnaire Section (1 Question Per Page) */}
          <div className="promo-form-section" style={{ flex: step === 'intro' ? 1.2 : 1 }}>
            <div className="dynamic-form" style={{ maxWidth: '600px', width: '100%', margin: '0 auto' }}>
              
              {/* STEP 1: INTRO */}
              {step === 'intro' && (
                <div className="fade-in-up">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '4px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '12px', border: '1px solid rgba(74,222,128,0.3)' }}>
                    <span>✨</span> Free Freshness Report • 90 Seconds
                  </div>
                  <h2 className="form-heading">Analyze Your Grocery List</h2>
                  <p className="form-subheading">See how many nutrients your store produce loses before reaching your kitchen table. Takes 90 seconds. Free. No commitment required.</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f87171' }}>50%</div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Nutrient Loss</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fbbf24' }}>7 Days</div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Store Transit</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4ade80' }}>90s</div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Free Analysis</div>
                    </div>
                  </div>

                  <button onClick={() => { wentNext.current = true; setStep('zipcode') }} className="btn-action">
                    Check My Nutrition Loss →
                  </button>
                </div>
              )}

              {/* STEP 2: ZIPCODE */}
              {step === 'zipcode' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Where are you located?</h2>
                  <p className="form-subheading">Enter your zipcode to analyze local store supply chain data in your area.</p>
                  
                  <div className="input-group">
                    <label>Zipcode</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 95125"
                      value={zipcode}
                      onChange={e => setZipcode(e.target.value)}
                      maxLength={5}
                      autoFocus
                    />
                  </div>

                  <button 
                    disabled={zipcode.length < 5}
                    onClick={() => { wentNext.current = true; setStep('produce') }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* STEP 3: PRODUCE SELECTION */}
              {step === 'produce' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">What produce do you buy most?</h2>
                  <p className="form-subheading">Select all produce items you regularly buy for your home.</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {[
                      'Heirloom Tomatoes',
                      'Hass Avocados',
                      'Oranges',
                      'Lemons',
                      'Limes',
                      'Strawberries',
                      'Blueberries',
                      'Figs',
                      'Peaches & Nectarines',
                      'Plums',
                      'Cherries',
                      'Apples',
                      'Pears',
                      'Spinach',
                      'Kale',
                      'Zucchini',
                      'Cucumbers',
                      'Sweet Bell Peppers',
                      'Fresh Basil & Herbs',
                      'Other'
                    ].map(item => {
                      const isSelected = selectedProduce.includes(item)
                      return (
                        <label 
                          key={item} 
                          className="checkbox-wrap" 
                          style={{ 
                            margin: 0, 
                            padding: '12px', 
                            background: isSelected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                            borderColor: isSelected ? '#22c55e' : 'rgba(255,255,255,0.08)'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelection(item)}
                          />
                          <span className="checkbox-text" style={{ fontSize: '0.85rem' }}>{item}</span>
                        </label>
                      )
                    })}
                  </div>

                  {selectedProduce.includes('Other') && (
                    <div className="fade-in-up" style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.04)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'rgba(255,255,255,0.8)' }}>Custom Produce Item</h4>
                      {customProduceList.map((cp, idx) => (
                        <div key={cp.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="e.g. Radishes" 
                            value={cp.name}
                            onChange={e => setCustomProduceList(prev => prev.map(p => p.id === cp.id ? { ...p, name: e.target.value } : p))}
                            style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'white' }}
                            autoFocus={idx === customProduceList.length - 1}
                          />
                          <button 
                            type="button" 
                            onClick={() => setCustomProduceList(prev => prev.filter(p => p.id !== cp.id))}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0 8px', fontSize: '1.2rem' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button 
                        type="button"
                        onClick={() => setCustomProduceList(prev => [...prev, { id: Math.random().toString(), name: '' }])}
                        style={{ background: 'none', border: 'none', color: '#4ade80', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        + Add another item
                      </button>
                    </div>
                  )}

                  {errorMsg && <div className="form-error-banner" style={{ marginBottom: 16 }}>{errorMsg}</div>}

                  <button 
                    onClick={() => {
                      if (selectedProduce.length === 0) {
                        setErrorMsg("Please select at least one produce item.")
                        return
                      }
                      setErrorMsg("")
                      wentNext.current = true
                      setStep('store_types')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* STEP 4: TYPES OF STORES (MULTI-SELECT CHECKBOXES) */}
              {step === 'store_types' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">Where do you usually buy produce?</h2>
                  <p className="form-subheading">Select all store types you visit or buy produce from (select all that apply).</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                    {[
                      { name: 'Traditional Supermarket', icon: '🏬', sub: 'Safeway, Kroger, Target, Lucky, Ralphs' },
                      { name: 'Specialty & Organic Grocer', icon: '🌱', sub: 'Whole Foods, Trader Joe\'s, Sprouts, Natural Grocers' },
                      { name: 'Farmers Market or Local Stand', icon: '🌾', sub: 'Weekly neighborhood markets & farm stands' },
                      { name: 'Wholesale & Discount Club', icon: '🛒', sub: 'Costco, Sam\'s Club, BJ\'s, Aldi' },
                      { name: 'Online Delivery App', icon: '🚚', sub: 'Instacart, Amazon Fresh, DoorDash, FreshDirect' },
                      { name: 'Local Farm / CSA Box', icon: '🌳', sub: 'Community Supported Agriculture box delivery' }
                    ].map(st => {
                      const isSelected = selectedStoreTypes.includes(st.name)
                      return (
                        <label 
                          key={st.name} 
                          className="checkbox-wrap"
                          style={{ 
                            padding: '14px 16px', 
                            borderRadius: '16px', 
                            margin: 0,
                            background: isSelected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                            borderColor: isSelected ? '#22c55e' : 'rgba(255,255,255,0.08)'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleStoreType(st.name)}
                            style={{ width: '20px', height: '20px', accentColor: '#22c55e' }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white' }}>{st.icon} {st.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{st.sub}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <button 
                    onClick={() => {
                      if (selectedStoreTypes.length === 0) {
                        setErrorMsg("Please select at least one store type.")
                        return
                      }
                      setErrorMsg("")
                      wentNext.current = true
                      setStep('fulfillment')
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* STEP 5: GROCERY GETTING METHODS (MULTI-SELECT CHECKBOXES) */}
              {step === 'fulfillment' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">How do you get your groceries?</h2>
                  <p className="form-subheading">Select all methods you use to get produce home (select all that apply).</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {[
                      { name: 'In-Store Shopping', icon: '🏬', sub: 'I drive to the store and shop in person' },
                      { name: 'Online Delivery', icon: '🚚', sub: 'Instacart, Amazon Fresh, DoorDash delivery to my door' },
                      { name: 'Curbside Pickup', icon: '📦', sub: 'I order online and pick up at store curbside' }
                    ].map(fm => {
                      const isSelected = selectedFulfillmentModes.includes(fm.name)
                      return (
                        <label 
                          key={fm.name}
                          className="checkbox-wrap"
                          style={{ 
                            padding: '16px', 
                            borderRadius: '16px', 
                            margin: 0,
                            background: isSelected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                            borderColor: isSelected ? '#22c55e' : 'rgba(255,255,255,0.08)'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleFulfillmentMode(fm.name)}
                            style={{ width: '20px', height: '20px', accentColor: '#22c55e' }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white' }}>{fm.icon} {fm.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{fm.sub}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <button 
                    onClick={() => {
                      if (selectedFulfillmentModes.length === 0) {
                        setErrorMsg("Please select at least one method.")
                        return
                      }
                      setErrorMsg("")
                      wentNext.current = true; 
                      setStep('frequency') 
                    }} 
                    className="btn-action"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* STEP 6: BUYING FREQUENCY */}
              {step === 'frequency' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">How often do you buy produce?</h2>
                  <p className="form-subheading">Storage time in your fridge impacts nutrient retention.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {[
                      { id: '2weeks', label: '📅 Once every 2 weeks', sub: 'Highest fridge storage time (50%–70% Vitamin C loss)' },
                      { id: '1week', label: '📅 Once a week', sub: 'Standard weekly grocery run' },
                      { id: '2-3times', label: '📅 2–3 times per week', sub: 'Frequent fresh trips' }
                    ].map(f => (
                      <div 
                        key={f.id}
                        onClick={() => setBuyingFrequency(f.id)}
                        className="checkbox-wrap"
                        style={{ 
                          padding: '16px', 
                          borderRadius: '16px', 
                          cursor: 'pointer',
                          background: buyingFrequency === f.id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                          borderColor: buyingFrequency === f.id ? '#22c55e' : 'rgba(255,255,255,0.08)'
                        }}
                      >
                        <input 
                          type="radio" 
                          name="frequency"
                          checked={buyingFrequency === f.id}
                          onChange={() => setBuyingFrequency(f.id)}
                          style={{ width: '20px', height: '20px', accentColor: '#22c55e' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white' }}>{f.label}</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{f.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => { wentNext.current = true; setStep('neighbor_buying') }} className="btn-action">
                    Next →
                  </button>
                </div>
              )}

              {/* STEP 7: NEIGHBOR BUYING OPENNESS */}
              {step === 'neighbor_buying' && (
                <div className="fade-in-up">
                  <h2 className="form-heading">How open are you to buying fresh produce directly from local neighbors?</h2>
                  <p className="form-subheading">Backyard harvest is picked at peak ripeness on the same day.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {[
                      { id: 'very_open', label: '🌟 Very open to trying it!', sub: 'I\'d love to buy fresh, same-day harvested produce from local neighbors' },
                      { id: 'somewhat_open', label: '🌿 Open if convenient', sub: 'If it\'s organic, fresh, and easy to pick up nearby' },
                      { id: 'curious', label: '💡 Curious to see options', sub: 'I\'d like to see what neighbors in my area are growing first' }
                    ].map(n => (
                      <div 
                        key={n.id}
                        onClick={() => setNeighborBuyingComfort(n.id)}
                        className="checkbox-wrap"
                        style={{ 
                          padding: '16px', 
                          borderRadius: '16px', 
                          cursor: 'pointer',
                          background: neighborBuyingComfort === n.id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                          borderColor: neighborBuyingComfort === n.id ? '#22c55e' : 'rgba(255,255,255,0.08)'
                        }}
                      >
                        <input 
                          type="radio" 
                          name="neighbor_buying"
                          checked={neighborBuyingComfort === n.id}
                          onChange={() => setNeighborBuyingComfort(n.id)}
                          style={{ width: '20px', height: '20px', accentColor: '#22c55e' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white' }}>{n.label}</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{n.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleCalculate} className="btn-action">
                    Calculate My Nutrition Loss →
                  </button>
                </div>
              )}

              {/* STEP 8: CALCULATING */}
              {step === 'calculating' && (
                <div className="promo-loading fade-in-up" style={{ minHeight: '300px' }}>
                  <div className="spinner"></div>
                  <div>Analyzing post-harvest degradation data for your grocery items...</div>
                </div>
              )}

              {/* STEP 9: LEAD CAPTURE / AUTH CHOICES */}
              {step === 'lead-capture' && (
                <div className="fade-in-up">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '4px 12px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '12px', border: '1px solid rgba(74,222,128,0.3)' }}>
                    <span>✅</span> Analysis Complete
                  </div>
                  <h2 className="form-heading">Where should we send your nutrition loss report?</h2>
                  <p className="form-subheading">Your personalized produce degradation report & local freshness matches are ready.</p>

                  {/* Top: Name & Phone Inputs */}
                  <div style={{ marginBottom: '16px' }}>
                    {errorMsg && <div className="form-error-banner" style={{ marginBottom: '16px' }}>{errorMsg}</div>}
                    <div className="input-group">
                      <label>Your Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <input 
                        type="text" 
                        placeholder="First and Last Name" 
                        value={name} 
                        onChange={e => { setName(e.target.value); setErrorMsg('') }} 
                        required 
                        autoFocus
                      />
                    </div>

                    <div className="input-group" style={{ marginTop: '12px' }}>
                      <label>Phone Number (Optional for SMS match alerts)</label>
                      <input 
                        type="tel" 
                        placeholder="(555) 000-0000" 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                      />
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="marketingConsentCheck"
                        checked={marketingConsent}
                        onChange={e => setMarketingConsent(e.target.checked)}
                        style={{ accentColor: '#22c55e', width: '16px', height: '16px' }}
                      />
                      <label htmlFor="marketingConsentCheck" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                        I agree to receive local produce availability & degradation report updates.
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
                          saveNutritionDraft({ name, phone, marketingConsent })
                          const supabase = createClient();
                          await supabase.auth.signInWithOAuth({
                            provider: 'google',
                            options: { redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent('/check-nutrition-loss?autostart=1')}` }
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
                          saveNutritionDraft({ name, phone, marketingConsent })
                          const supabase = createClient();
                          await supabase.auth.signInWithOAuth({
                            provider: 'apple',
                            options: { redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent('/check-nutrition-loss?autostart=1')}` }
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
                            placeholder="you@example.com" 
                            value={email} 
                            onChange={e => { setEmail(e.target.value); setErrorMsg('') }} 
                            required 
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
                          {isLoading ? 'Generating Report...' : 'Continue with email'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 10: RESULTS */}
              {step === 'results' && results && (
                <div className="fade-in-up" style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🥬</div>
                  <h2 className="form-heading" style={{ fontSize: '1.8rem', marginBottom: '8px', color: '#4ade80' }}>
                    Your Nutrition Report is Ready!
                  </h2>
                  <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', marginBottom: '24px', lineHeight: 1.6 }}>
                    We've emailed a full copy of this report to <strong>{email}</strong>.
                  </p>

                  {/* Summary / Freshness Score Card */}
                  <div style={{ background: 'rgba(34,197,94,0.1)', padding: '24px', borderRadius: '20px', border: '1px solid rgba(74,222,128,0.3)', marginBottom: '24px', textAlign: 'left' }}>
                    <div style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                      POST-HARVEST ANALYSIS
                    </div>
                    <p style={{ fontSize: '1.05rem', color: '#ffffff', lineHeight: 1.6, margin: 0 }}>
                      {results.summary || 'Store-bought produce loses significant Vitamin C and essential nutrients during multi-day transport.'}
                    </p>
                  </div>

                  {/* Items Breakdown Table */}
                  {results.items && results.items.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: '24px', textAlign: 'left' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#4ade80', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '12px 16px' }}>Item</th>
                            <th style={{ padding: '12px 16px' }}>Nutrient Loss</th>
                            <th style={{ padding: '12px 16px' }}>Transit Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.items.map((item: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: idx < results.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 600, textTransform: 'capitalize' }}>{item.name}</td>
                              <td style={{ padding: '12px 16px', color: '#f87171', fontWeight: 700 }}>{item.nutrient_loss_pct}</td>
                              <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)' }}>{item.time_to_shelf}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Dynamic CTA depending on marketplace availability */}
                  {(() => {
                    const firstProduce = selectedProduce.find(p => p !== 'Other') || customProduceList[0]?.name || ''
                    if (hasActiveListings) {
                      return (
                        <Link 
                          href={`/market?q=${encodeURIComponent(firstProduce)}&zipcode=${encodeURIComponent(zipcode || '95125')}`} 
                          className="btn-action" 
                          style={{ display: 'block', textDecoration: 'none', textAlign: 'center', background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 14px rgba(34,197,94,0.4)' }}
                        >
                          🛒 Find Fresh {firstProduce ? firstProduce.charAt(0).toUpperCase() + firstProduce.slice(1) : 'Harvest'} Near You →
                        </Link>
                      )
                    } else {
                      return (
                        <Link 
                          href={`/interest?scope=buy&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&zipcode=${encodeURIComponent(zipcode || '95125')}${firstProduce ? `&produce=${encodeURIComponent(firstProduce)}` : ''}`} 
                          className="btn-action" 
                          style={{ display: 'block', textDecoration: 'none', textAlign: 'center', background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 14px rgba(34,197,94,0.4)' }}
                        >
                          🔔 Set Up Your Produce Alerts →
                        </Link>
                      )
                    }
                  })()}
                </div>
              )}

              {/* STEP 10: QUEUED (Fallback if AI delayed) */}
              {step === 'queued' && (
                <div className="fade-in-up" style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🌱</div>
                  <h2 className="form-heading" style={{ fontSize: '1.8rem', marginBottom: '12px' }}>
                    Your Report is On Its Way!
                  </h2>
                  <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', marginBottom: '24px', lineHeight: 1.6 }}>
                    We're analyzing post-harvest degradation data for your specific items and emailing your personalized report to <strong>{email}</strong>.
                  </p>

                  <div style={{ background: 'rgba(34,197,94,0.1)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(74,222,128,0.3)', marginBottom: '24px', textAlign: 'left' }}>
                    <p style={{ fontSize: '0.95rem', color: '#4ade80', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                      🔔 We've saved your produce list to match you with backyard growers near {zipcode || '95125'}! As soon as local neighbors harvest fresh produce, we'll notify you.
                    </p>
                  </div>
                  
                  <Link href="/interest?scope=buy" className="btn-action" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
                    🔔 Set Up Your Produce Alerts →
                  </Link>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        html, body {
          background-color: #0a0f09 !important;
        }
        
        .casagrown-promo-page { min-height: 100vh; font-family: 'Inter', sans-serif; position: relative; display: flex; flex-direction: column; color: #ffffff; background: #0a0f09; overflow-x: hidden; }

        .promo-bg-layer { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(ellipse 60% 50% at 20% 20%, rgba(34,197,94,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(245,166,35,0.06) 0%, transparent 60%); z-index: -2; }
        .promo-bg-overlay { display: none; }

        .casagrown-nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: rgba(10,15,9,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.08); z-index: 10; }
        .nav-left { display: flex; align-items: center; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #ffffff; letter-spacing: -0.5px; }
        .nav-logo-img { height: 40px; width: auto; }
        .nav-tagline { font-weight: 600; font-size: 0.95rem; color: #4ade80; letter-spacing: 0.5px; border-left: 2px solid rgba(74,222,128,0.4); padding-left: 20px; }

        .promo-content-wrapper { flex: 1; display: flex; justify-content: center; align-items: center; padding: 60px 24px; }

        .promo-main-glass { display: flex; flex-direction: row; background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.4); max-width: 1100px; width: 100%; min-height: 520px; align-items: stretch; overflow: hidden; }

        .promo-hero-section { flex: 0.8; padding: 40px; background: rgba(255, 255, 255, 0.02); border-right: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; justify-content: center; min-height: 520px; }
        .promo-form-section { flex: 1.2; padding: 40px 60px; display: flex; flex-direction: column; justify-content: center; min-height: 520px; }

        .promo-headline { font-size: 2.2rem; font-weight: 800; color: #ffffff; line-height: 1.2; margin-bottom: 16px; letter-spacing: -1px; }
        .promo-description { font-size: 1.1rem; color: rgba(255,255,255,0.7); line-height: 1.6; }

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

        .form-error-banner { background: rgba(239,68,68,0.15); border-left: 4px solid #ef4444; color: #f87171; padding: 16px; border-radius: 12px; font-weight: 600; font-size: 0.95rem; }

        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        .promo-loading { display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 600; color: #4ade80; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(34,197,94,0.2); border-left-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .promo-main-glass { flex-direction: column; min-height: auto; }
          .promo-hero-section { padding: 24px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); min-height: auto; }
          .promo-form-section { padding: 32px 24px; min-height: auto; }
          .promo-headline { font-size: 1.8rem; margin-bottom: 12px; }
          .casagrown-nav { padding: 16px 24px; }
          .nav-tagline { display: none; }
        }
      `}</style>
    </div>
  )
}
