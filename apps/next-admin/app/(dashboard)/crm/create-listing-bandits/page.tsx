'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
)

type Experiment = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

type Variant = {
  id: string
  experiment_id: string
  slug: string
  name: string
  is_active: boolean
  prior_conversions: number
  prior_failures: number
  views_count: number
  conversions_count: number
}

// Client-side Beta distribution sampler matching DB plpgsql logic
function sampleBeta(alpha: number, beta: number): number {
  let x = 0
  let y = 0
  
  // Safe bounds to prevent infinite loops
  const a = Math.max(1, Math.round(alpha))
  const b = Math.max(1, Math.round(beta))
  
  for (let i = 0; i < a; i++) {
    x -= Math.log(Math.random() || 0.0001)
  }
  for (let i = 0; i < b; i++) {
    y -= Math.log(Math.random() || 0.0001)
  }
  
  if (x + y === 0) return 0.5
  return x / (x + y)
}

export default function CreateListingBanditsPage() {
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState('')
  
  // Form state
  const [formPriors, setFormPriors] = useState<Record<string, { conversions: number; failures: number; is_active: boolean }>>({})
  
  // Simulation state
  const [simRunning, setSimRunning] = useState(false)
  const [simResults, setSimResults] = useState<Record<string, number> | null>(null)

  const toast = (msg: string, ms = 3000) => {
    setMessage(msg)
    if (!msg.startsWith('Error')) {
      setTimeout(() => setMessage(''), ms)
    }
  }

  const fetchExperimentData = async () => {
    setLoading(true)
    try {
      // 1. Fetch active listing MAB experiment
      const { data: expData, error: expError } = await supabase
        .from('crm_experiments')
        .select('*')
        .eq('name', 'listing_wizard_v2')
        .single()

      if (expError || !expData) {
        console.error('Experiment crm_experiments not found:', expError)
        setLoading(false)
        return
      }

      setExperiment(expData)

      // 2. Fetch variants
      const { data: varData, error: varError } = await supabase
        .from('crm_experiment_variants')
        .select('*')
        .eq('experiment_id', expData.id)
        .order('slug', { ascending: true })

      if (varError) {
        console.error('Error fetching variants:', varError)
      } else {
        const variantsList = varData as Variant[]
        setVariants(variantsList)
        
        // Initialize form state
        const initialForm: Record<string, { conversions: number; failures: number; is_active: boolean }> = {}
        variantsList.forEach(v => {
          initialForm[v.id] = {
            conversions: v.prior_conversions,
            failures: v.prior_failures,
            is_active: v.is_active,
          }
        })
        setFormPriors(initialForm)
      }
    } catch (e: any) {
      console.error('Exception fetching MAB data:', e)
      toast(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExperimentData()
  }, [])

  const handlePriorChange = (id: string, field: 'conversions' | 'failures', value: string) => {
    const num = Math.max(1, parseInt(value) || 0)
    setFormPriors(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: num,
      }
    }))
  }

  const handleToggleActive = (id: string) => {
    setFormPriors(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        is_active: !prev[id].is_active,
      }
    }))
  }

  const handleSave = async () => {
    if (!experiment) return
    setSaving(true)
    
    try {
      let hasError = false
      for (const variantId of Object.keys(formPriors)) {
        const { conversions, failures, is_active } = formPriors[variantId]
        
        const { error } = await supabase
          .from('crm_experiment_variants')
          .update({
            prior_conversions: conversions,
            prior_failures: failures,
            is_active,
          })
          .eq('id', variantId)
          
        if (error) {
          console.error(`Error saving variant ${variantId}:`, error)
          hasError = true
        }
      }
      
      if (hasError) {
        toast('Error saving configuration details.')
      } else {
        toast('Configuration saved successfully!')
        await fetchExperimentData()
      }
    } catch (e: any) {
      console.error(e)
      toast(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleResetStats = async () => {
    if (!experiment || !confirm('Are you sure you want to reset all Views and Conversions stats back to 0 for this experiment? This cannot be undone.')) return
    setResetting(true)
    
    try {
      const { error } = await supabase
        .from('crm_experiment_variants')
        .update({
          views_count: 0,
          conversions_count: 0,
        })
        .eq('experiment_id', experiment.id)

      if (error) {
        toast(`Error: ${error.message}`)
      } else {
        toast('Statistics reset successfully!')
        await fetchExperimentData()
      }
    } catch (e: any) {
      toast(`Error: ${e.message}`)
    } finally {
      setResetting(false)
    }
  }

  const runSimulation = () => {
    if (variants.length === 0) return
    setSimRunning(true)
    
    setTimeout(() => {
      const iterations = 1000
      const winCounts: Record<string, number> = {}
      
      // Initialize counts
      variants.forEach(v => {
        winCounts[v.slug] = 0
      })
      
      // Run Thompson Sampling iterations
      for (let i = 0; i < iterations; i++) {
        let bestSlug = ''
        let bestScore = -1
        
        variants.forEach(v => {
          // Get values from form input state or fallback to variant values
          const priors = formPriors[v.id] || { conversions: v.prior_conversions, failures: v.prior_failures, is_active: v.is_active }
          
          if (!priors.is_active) return // Skip inactive variants
          
          const alpha = priors.conversions + v.conversions_count
          const beta = priors.failures + (v.views_count - v.conversions_count)
          
          const score = sampleBeta(alpha, beta)
          if (score > bestScore) {
            bestScore = score
            bestSlug = v.slug
          }
        })
        
        if (bestSlug) {
          winCounts[bestSlug] = (winCounts[bestSlug] || 0) + 1
        }
      }
      
      // Calculate allocation percentage
      const finalAllocation: Record<string, number> = {}
      variants.forEach(v => {
        const wins = winCounts[v.slug] || 0
        finalAllocation[v.slug] = parseFloat(((wins / iterations) * 100).toFixed(1))
      })
      
      setSimResults(finalAllocation)
      setSimRunning(false)
    }, 300)
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Create Listing Bandits</h1>
          <p className="crm-subtitle">
            Configure Thompson Sampling parameters and priors to direct traffic between the standard and simple listing wizards.
          </p>
        </div>
      </div>

      {message && (
        <div className={`crm-toast ${message.startsWith('Error') ? 'error' : 'success'}`}>
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {loading ? (
        <div className="crm-empty" style={{ padding: '60px 0' }}>Loading MAB configuration…</div>
      ) : !experiment ? (
        <div className="crm-empty" style={{ padding: '60px 0' }}>
          ⚠️ Experiment <code>listing_wizard_v2</code> not found in database. 
          Please ensure your migrations are fully applied.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Active Config and Priors Table */}
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Variant Name / Slug</th>
                  <th style={{ width: '15%' }}>Success Prior (Alpha)</th>
                  <th style={{ width: '15%' }}>Failure Prior (Beta)</th>
                  <th style={{ width: '12%' }}>Views</th>
                  <th style={{ width: '12%' }}>Conversions</th>
                  <th style={{ width: '16%' }}>Current Conv. Rate</th>
                  <th style={{ width: '10%' }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {variants.map(v => {
                  const state = formPriors[v.id] || { conversions: v.prior_conversions, failures: v.prior_failures, is_active: v.is_active }
                  const cr = v.views_count > 0 ? ((v.conversions_count / v.views_count) * 100).toFixed(1) : '0.0'
                  
                  return (
                    <tr key={v.id}>
                      <td>
                        <strong style={{ display: 'block', color: '#111827' }}>{v.name}</strong>
                        <code style={{ fontSize: '0.8rem', color: '#6b7280' }}>{v.slug}</code>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          style={{ width: '90px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                          value={state.conversions}
                          onChange={e => handlePriorChange(v.id, 'conversions', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          style={{ width: '90px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                          value={state.failures}
                          onChange={e => handlePriorChange(v.id, 'failures', e.target.value)}
                        />
                      </td>
                      <td style={{ color: '#4b5563', fontWeight: 500 }}>{v.views_count}</td>
                      <td style={{ color: '#4b5563', fontWeight: 500 }}>{v.conversions_count}</td>
                      <td>
                        <span 
                          style={{ 
                            display: 'inline-block',
                            padding: '4px 8px', 
                            background: '#f3f4f6', 
                            borderRadius: '12px', 
                            fontSize: '0.85rem', 
                            fontWeight: 600, 
                            color: '#374151' 
                          }}
                        >
                          📈 {cr}%
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`crm-toggle ${state.is_active ? 'active' : ''}`}
                          onClick={() => handleToggleActive(v.id)}
                          style={{ padding: 4 }}
                        >
                          <span className="toggle-dot" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start' }}>
            <button 
              className="crm-btn-primary" 
              onClick={handleSave} 
              disabled={saving}
              style={{ padding: '10px 20px', fontSize: '0.95rem' }}
            >
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button 
              className="crm-btn-secondary" 
              onClick={handleResetStats}
              disabled={resetting}
              style={{ padding: '10px 20px', fontSize: '0.95rem', color: '#dc2626', borderColor: '#fee2e2' }}
            >
              {resetting ? 'Resetting…' : 'Reset Views & Conversions'}
            </button>
          </div>

          {/* Real-time Allocation Simulator Card */}
          <div className="crm-form-card" style={{ marginTop: 12, padding: 24, border: '1px solid #e5e7eb', borderRadius: '12px', background: '#ffffff' }}>
            <h2 className="crm-form-title" style={{ fontSize: '1.25rem', marginBottom: 8, fontWeight: 700, color: '#111827' }}>
              Traffic Allocation Simulator
            </h2>
            <p className="crm-subtitle" style={{ fontSize: '0.9rem', marginBottom: 20, color: '#4b5563' }}>
              Run a quick simulation of 1,000 traffic assignments using your entered priors and current conversion counts to estimate current split percentage.
            </p>

            <button 
              className="crm-btn-primary" 
              onClick={runSimulation} 
              disabled={simRunning}
              style={{ padding: '8px 16px', background: '#0284c7', borderColor: '#0284c7', marginBottom: 20 }}
            >
              {simRunning ? 'Simulating…' : '📊 Run Assignment Simulation'}
            </button>

            {simResults && (
              <div 
                style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px', 
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', margin: 0 }}>
                  Estimated Traffic Distribution:
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {variants.map(v => {
                    const percent = simResults[v.slug] ?? 0
                    return (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: '180px', fontSize: '0.9rem', fontWeight: 500, color: '#475569' }}>
                          {v.name}
                        </div>
                        <div style={{ flex: 1, height: '16px', background: '#e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
                          <div 
                            style={{ 
                              width: `${percent}%`, 
                              height: '100%', 
                              background: v.slug.includes('simple') ? '#22c55e' : '#3b82f6', 
                              borderRadius: '8px',
                              transition: 'width 0.5s ease-out'
                            }} 
                          />
                        </div>
                        <div style={{ width: '60px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', textAlign: 'right' }}>
                          {percent}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
