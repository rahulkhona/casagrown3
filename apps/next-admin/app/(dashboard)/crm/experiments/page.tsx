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
  trigger_event: string
  conversion_event: string
  is_active: boolean
  created_at: string
}

type Variant = {
  id: string
  experiment_id: string
  sequence_id: string
  prior_alpha: number
  prior_beta: number
  sends_count: number
  conversions_count: number
  is_active: boolean
  sequence_name?: string
}

type Sequence = {
  id: string
  name: string
  status: string
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)

  // Predefined MAB calculations state
  const [conversions, setConversions] = useState<Record<string, { sends: number; convs: number }>>({})
  const [breakdowns, setBreakdowns] = useState<Record<string, Array<{ sequence_id: string; listings_created: number; accounts_created: number; profiles_completed: number }>>>({})
  const [expandedExpId, setExpandedExpId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_event: 'lead.created',
    conversion_event: 'listings_created',
    selected_sequences: [] as string[]
  })
  const [priors, setPriors] = useState<Record<string, number>>({}) // Map sequence ID to traffic split % (0-100)

  const toast = (msg: string, ms = 4000) => {
    setMessage(msg)
    if (!msg.startsWith('Error')) setTimeout(() => setMessage(''), ms)
  }

  const fetchData = async () => {
    setLoading(true)
    const [expRes, varRes, seqRes] = await Promise.all([
      supabase.from('crm_sequence_experiments').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_sequence_experiment_variants').select('*'),
      supabase.from('crm_sequences').select('id, name, status')
    ])

    if (expRes.error) {
      toast(`Error fetching experiments: ${expRes.error.message}`)
    } else {
      const exps = expRes.data || []
      setExperiments(exps)
      
      // Load calculated conversions dynamically
      try {
        const convPromises = exps.map(async (exp) => {
          const { data, error } = await supabase.rpc('calculate_journey_conversions', { p_experiment_id: exp.id })
          if (!error && data) {
            return { expId: exp.id, data }
          }
          return { expId: exp.id, data: [] }
        })
        const allConvs = await Promise.all(convPromises)
        const conversionsMap: Record<string, { sends: number; convs: number }> = {}
        allConvs.forEach(c => {
          c.data.forEach((row: any) => {
            conversionsMap[`${c.expId}_${row.sequence_id}`] = {
              sends: row.sends_count,
              convs: row.conversions_count
            }
          })
        })
        setConversions(conversionsMap)
      } catch (err) {
        console.error(err)
      }
    }

    if (varRes.error) {
      console.error(varRes.error)
    } else {
      setVariants(varRes.data || [])
    }

    if (seqRes.error) {
      console.error(seqRes.error)
    } else {
      setSequences(seqRes.data || [])
    }
    setLoading(false)
  }

  const fetchBreakdown = async (expId: string) => {
    if (breakdowns[expId]) return
    const { data, error } = await supabase.rpc('calculate_journey_metrics_breakdown', { p_experiment_id: expId })
    if (error) {
      console.error(error)
    } else if (data) {
      setBreakdowns(prev => ({ ...prev, [expId]: data }))
    }
  }

  const toggleExpandBreakdown = (expId: string) => {
    if (expandedExpId === expId) {
      setExpandedExpId(null)
    } else {
      setExpandedExpId(expId)
      fetchBreakdown(expId)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const totalPercentage = parseFloat(
    form.selected_sequences.reduce((acc, id) => {
      const val = parseFloat(priors[id] as any) || 0
      return acc + val
    }, 0).toFixed(2)
  )

  const handleToggleSequence = (seqId: string, isChecked: boolean) => {
    setForm(f => {
      const nextList = isChecked
        ? f.selected_sequences.filter(id => id !== seqId)
        : [...f.selected_sequences, seqId]
      
      // Auto-redistribute to sum to exactly 100%
      if (nextList.length > 0) {
        const share = 100 / nextList.length
        const nextPriors: Record<string, number> = {}
        nextList.forEach((id) => {
          nextPriors[id] = parseFloat(share.toFixed(1))
        })
        const currentSum = nextList.reduce((acc, id) => acc + nextPriors[id], 0)
        const diff = 100 - currentSum
        if (diff !== 0) {
          nextPriors[nextList[nextList.length - 1]] = parseFloat((nextPriors[nextList[nextList.length - 1]] + diff).toFixed(2))
        }
        setPriors(nextPriors)
      } else {
        setPriors({})
      }

      return { ...f, selected_sequences: nextList }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || form.selected_sequences.length < 2) {
      toast('Error: Please provide a name and select at least 2 sequences.')
      return
    }

    if (Math.abs(totalPercentage - 100) > 0.01) {
      toast(`Error: Total traffic split must equal exactly 100%. Current sum: ${totalPercentage}%`)
      return
    }

    setSaving(true)
    const { data: exp, error: expError } = await supabase
      .from('crm_sequence_experiments')
      .insert({
        name: form.name,
        description: form.description || null,
        trigger_event: form.trigger_event,
        conversion_event: form.conversion_event,
        is_active: true
      })
      .select()
      .single()

    if (expError || !exp) {
      toast(`Error creating experiment: ${expError?.message}`)
      setSaving(false)
      return
    }

    // Map traffic split percentages to Alpha (α) and Beta (β) priors.
    // E.g., 33.33% share -> α = 3333 successes, β = 6667 failures (total trials = 10,000).
    // Clamped between 1 and 9999 to prevent boundary errors in Deno/Postgres sampler.
    const variantRows = form.selected_sequences.map(seqId => {
      const pct = priors[seqId] || 0
      const scaledAlpha = Math.round(pct * 100)
      const prior_alpha = Math.max(1, Math.min(9999, scaledAlpha))
      const prior_beta = Math.max(1, Math.min(9999, 10000 - prior_alpha))
      return {
        experiment_id: exp.id,
        sequence_id: seqId,
        prior_alpha,
        prior_beta,
        sends_count: 0,
        conversions_count: 0,
        is_active: true
      }
    })

    const { error: varError } = await supabase
      .from('crm_sequence_experiment_variants')
      .insert(variantRows)

    if (varError) {
      toast(`Error creating variants: ${varError.message}`)
    } else {
      toast('Experiment created successfully!')
      setCreating(false)
      setForm({
        name: '',
        description: '',
        trigger_event: 'lead.created',
        conversion_event: 'listings_created',
        selected_sequences: []
      })
      setPriors({})
      fetchData()
    }
    setSaving(false)
  }

  const toggleExperiment = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('crm_sequence_experiments')
      .update({ is_active: !currentStatus })
      .eq('id', id)

    if (error) {
      toast(`Error: ${error.message}`)
    } else {
      toast(`Experiment status updated`)
      fetchData()
    }
  }

  const deleteExperiment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this experiment?')) return
    const { error } = await supabase.from('crm_sequence_experiments').delete().eq('id', id)
    if (error) {
      toast(`Error: ${error.message}`)
    } else {
      toast('Experiment deleted')
      fetchData()
    }
  }

  const getVariantsForExperiment = (expId: string) => {
    return variants
      .filter(v => v.experiment_id === expId)
      .map(v => {
        const seq = sequences.find(s => s.id === v.sequence_id)
        const customData = conversions[`${expId}_${v.sequence_id}`]
        return {
          ...v,
          sends_count: customData ? customData.sends : v.sends_count,
          conversions_count: customData ? customData.convs : v.conversions_count,
          sequence_name: seq ? seq.name : 'Unknown Sequence'
        }
      })
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#1e293b', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>Journey Testing</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>
            Compare full sequence customer journeys using Thompson Sampling multi-arm bandits.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            style={{ padding: '10px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
          >
            + Create Journey Experiment
          </button>
        )}
      </div>

      {message && (
        <div style={{
          padding: '12px 16px',
          background: message.startsWith('Error') ? '#fef2f2' : '#f0fdf4',
          border: '1px solid',
          borderColor: message.startsWith('Error') ? '#fca5a5' : '#bbf7d0',
          borderRadius: 6,
          color: message.startsWith('Error') ? '#991b1b' : '#166534',
          marginBottom: '20px',
          fontSize: '0.875rem'
        }}>
          {message}
        </div>
      )}

      {creating ? (
        <div style={{ background: 'white', borderRadius: 8, padding: '24px', border: '1px solid #e2e8f0', maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', color: '#0f172a' }}>Create Trigger Split Experiment</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Experiment Name *</label>
              <input
                type="text"
                placeholder="e.g. Lead Follow-Up Split"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, width: '100%', fontSize: '0.875rem' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Description</label>
              <textarea
                placeholder="e.g. Testing control sequence against 3-step challenger sequence."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, width: '100%', fontSize: '0.875rem', height: '80px', resize: 'none' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Trigger Event *</label>
                <select
                  value={form.trigger_event}
                  onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, width: '100%', fontSize: '0.875rem' }}
                >
                  <option value="lead.created">lead.created (New Leads)</option>
                  <option value="user.first_login">user.first_login (First Completed Login)</option>
                  <option value="market_orders.purchase_completed">market_orders.purchase_completed (Buyer Complete)</option>
                  <option value="market_orders.sale_completed">market_orders.sale_completed (Seller Complete)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Conversion Metric *</label>
                <select
                  value={form.conversion_event}
                  onChange={e => setForm(f => ({ ...f, conversion_event: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, width: '100%', fontSize: '0.875rem' }}
                >
                  <option value="listings_created">Listings Created (Drip Window + 7d Grace)</option>
                  <option value="accounts_created">Accounts Created (Drip Window + 7d Grace)</option>
                  <option value="profiles_completed">Profiles Completed (Drip Window + 7d Grace)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Select Alternative Sequences *</label>
              <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#64748b' }}>Select at least 2 active sequences and configure their starting priors.</p>
              
              {/* Prior Calibration Guide */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '12px',
                marginBottom: '12px',
                fontSize: '0.75rem',
                lineHeight: '1.4',
                color: '#475569',
              }}>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>💡 Starting Bias & Priors Guide:</strong>
                Define the initial split probability (traffic share) for each sequence.
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px' }}>
                  <li><strong>Equal Split:</strong> Keep allocations equal (e.g. 50%/50% or 33%/33%/34%). Selected sequences default to an equal split automatically.</li>
                  <li><strong>100% Rollout Bias:</strong> Allocate 100% of traffic to Sequence A and 0% to the other. Sequence A will receive all traffic initially until conversion performance shifts the weights.</li>
                  <li>The sum of all sequence allocations must equal exactly 100%.</li>
                </ul>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px', marginBottom: '10px' }}>
                {sequences
                  .filter(s => s.status === 'active' || s.status === 'draft')
                  .map(s => {
                    const checked = form.selected_sequences.includes(s.id)
                    const val = priors[s.id] || 0

                    return (
                      <div key={s.id} style={{ marginBottom: '6px' }}>
                        <div
                          onClick={() => handleToggleSequence(s.id, checked)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '8px 12px',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            borderRadius: 6,
                            background: checked ? '#eff6ff' : 'transparent',
                            border: checked ? '1px solid #bfdbfe' : '1px solid transparent',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            border: checked ? '2px solid #2563eb' : '2px solid #cbd5e1',
                            background: checked ? '#2563eb' : 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: 'bold',
                          }}>
                            {checked && '✓'}
                          </div>
                          <span style={{ fontWeight: checked ? 600 : 400, color: '#334155' }}>
                            {s.name} <span style={{ fontSize: '0.75rem', color: s.status === 'active' ? '#16a34a' : '#ea580c' }}>({s.status})</span>
                          </span>
                        </div>
                        
                        {checked && (
                          <div 
                            onClick={e => e.stopPropagation()} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center',
                              gap: '12px', 
                              padding: '8px 12px 10px 42px', 
                              background: '#eff6ff', 
                              borderLeft: '1px solid #bfdbfe',
                              borderRight: '1px solid #bfdbfe',
                              borderBottom: '1px solid #bfdbfe',
                              borderBottomLeftRadius: 6,
                              borderBottomRightRadius: 6,
                              marginTop: '-6px'
                            }}
                          >
                            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>Initial Traffic Allocation:</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={val}
                              onChange={e => {
                                const rawVal = e.target.value
                                if (rawVal === '') {
                                  setPriors(prev => ({ ...prev, [s.id]: 0 }))
                                  return
                                }
                                const num = Math.max(0, Math.min(100, parseFloat(rawVal) || 0))
                                setPriors(prev => ({
                                  ...prev,
                                  [s.id]: num
                                }))
                              }}
                              style={{ width: '65px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.75rem', textAlign: 'center' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>% of traffic</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>

              {/* Split balancer status bar */}
              {form.selected_sequences.length >= 2 && (
                <div style={{
                  padding: '8px 12px',
                  background: totalPercentage === 100 ? '#f0fdf4' : '#fef2f2',
                  border: '1px solid',
                  borderColor: totalPercentage === 100 ? '#bbf7d0' : '#fca5a5',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: totalPercentage === 100 ? '#166534' : '#991b1b',
                }}>
                  <span>Total Split Allocation: {totalPercentage}%</span>
                  <span>{totalPercentage === 100 ? '✓ Balanced (100%)' : `⚠ Sum must be 100%`}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setCreating(false)}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 600, cursor: 'pointer', color: '#475569' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (form.selected_sequences.length >= 2 && totalPercentage !== 100)}
                style={{
                  padding: '8px 16px',
                  background: (form.selected_sequences.length >= 2 && totalPercentage !== 100) ? '#93c5fd' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: (form.selected_sequences.length >= 2 && totalPercentage !== 100) ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Creating...' : 'Create Experiment'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading experiments...</div>
          ) : experiments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 40px', background: 'white', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎯</div>
              <h3 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No Sequence Experiments</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Create a trigger split experiment to compare different drip sequence flows.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
              {experiments.map(exp => {
                const expVariants = getVariantsForExperiment(exp.id)
                return (
                  <div key={exp.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 600 }}>{exp.name}</h3>
                          <span style={{
                            padding: '2px 8px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            borderRadius: 12,
                            background: exp.is_active ? '#ecfdf5' : '#f1f5f9',
                            color: exp.is_active ? '#065f46' : '#475569'
                          }}>
                            {exp.is_active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>{exp.description || 'No description'}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => toggleExpandBreakdown(exp.id)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', color: '#334155' }}
                        >
                          {expandedExpId === exp.id ? 'Hide Details' : 'Show Breakdowns'}
                        </button>
                        <button
                          onClick={() => toggleExperiment(exp.id, exp.is_active)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', color: '#334155' }}
                        >
                          {exp.is_active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          onClick={() => deleteExperiment(exp.id)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'transparent', border: '1px solid #fee2e2', borderRadius: 4, cursor: 'pointer', color: '#991b1b' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 6, display: 'flex', gap: '24px', marginBottom: 16, fontSize: '0.8rem', border: '1px solid #f1f5f9' }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Trigger Split:</span> <strong style={{ color: '#334155' }}>{exp.trigger_event}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Conversion Goal:</span> <strong style={{ color: '#334155' }}>{exp.conversion_event}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                        <div>Sequence Variant</div>
                        <div style={{ textAlign: 'center' }}>Enrollments</div>
                        <div style={{ textAlign: 'center' }}>Conversions</div>
                        <div style={{ textAlign: 'center' }}>Conv. Rate</div>
                        <div>Performance Lift</div>
                      </div>
                      {expVariants.map((v, idx) => {
                        const rate = v.sends_count > 0 ? (v.conversions_count / v.sends_count) * 100 : 0
                        return (
                          <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr', alignItems: 'center', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ fontWeight: 500, color: '#334155' }}>{v.sequence_name}</div>
                            <div style={{ textAlign: 'center', color: '#475569' }}>{v.sends_count}</div>
                            <div style={{ textAlign: 'center', color: '#475569' }}>{v.conversions_count}</div>
                            <div style={{ textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>{rate.toFixed(1)}%</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '8px', flex: 1, overflow: 'hidden' }}>
                                <div style={{ background: idx === 0 ? '#3b82f6' : '#10b981', height: '100%', width: `${Math.min(100, rate * 3)}%` }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{v.sends_count > 0 ? `(Beta: ${v.prior_alpha + v.conversions_count}/${v.prior_beta + v.sends_count - v.conversions_count})` : 'Priors only'}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {expandedExpId === exp.id && (
                      <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>📊 Full Funnel Metrics Breakdown</h4>
                        {breakdowns[exp.id] ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {expVariants.map((v, idx) => {
                              const row = breakdowns[exp.id]?.find(r => r.sequence_id === v.sequence_id)
                              const sends = v.sends_count
                              const listings = row ? row.listings_created : 0
                              const accounts = row ? row.accounts_created : 0
                              const profiles = row ? row.profiles_completed : 0

                              const listingRate = sends > 0 ? (listings / sends) * 100 : 0
                              const accountRate = sends > 0 ? (accounts / sends) * 100 : 0
                              const profileRate = sends > 0 ? (profiles / sends) * 100 : 0

                              return (
                                <div key={v.sequence_id} style={{ borderBottom: idx === expVariants.length - 1 ? 'none' : '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '6px' }}>{v.sequence_name}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', fontSize: '0.8rem' }}>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Listings Created:</span>{' '}
                                      <strong style={{ color: '#0f172a' }}>{listings} ({listingRate.toFixed(1)}%)</strong>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Accounts Created:</span>{' '}
                                      <strong style={{ color: '#0f172a' }}>{accounts} ({accountRate.toFixed(1)}%)</strong>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Profiles Completed:</span>{' '}
                                      <strong style={{ color: '#0f172a' }}>{profiles} ({profileRate.toFixed(1)}%)</strong>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', padding: '8px' }}>Loading funnel metrics...</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
