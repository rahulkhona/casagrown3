'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ExperimentSummary = {
  experiment_id: string
  name: string
  type: string // 'campaign' | 'sequence'
  mode: string
  total_variants: number
  total_sends: number
  total_conversions: number
  leading_variant_name: string | null
  leading_cvr_pct: number | null
  is_active: boolean
}

type VariantReport = {
  variant_id: string
  variant_name: string
  experiment_mode: string
  send_window_start: string
  send_window_end: string
  sends_count: number
  opens_count: number
  clicks_count: number
  conversions_count: number
  ctr_pct: number
  cvr_pct: number
  win_probability_pct: number
  traffic_share_pct: number
  lift_vs_baseline_pct: number
}

export default function MabExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExp, setSelectedExp] = useState<ExperimentSummary | null>(null)
  const [variantReports, setVariantReports] = useState<VariantReport[]>([])
  const [reportLoading, setReportLoading] = useState(false)

  const fetchSummaries = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_all_mab_experiments_summary')
    if (!error && data) {
      setExperiments(data as ExperimentSummary[])
    } else {
      setExperiments([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSummaries()
  }, [])

  const openReport = async (exp: ExperimentSummary) => {
    setSelectedExp(exp)
    setReportLoading(true)
    const { data, error } = await supabase.rpc('get_mab_campaign_report', { p_campaign_id: exp.experiment_id })
    if (!error && data) {
      setVariantReports(data as VariantReport[])
    } else {
      setVariantReports([])
    }
    setReportLoading(false)
  }

  const totalSends = experiments.reduce((acc, e) => acc + (e.total_sends || 0), 0)
  const totalConvs = experiments.reduce((acc, e) => acc + (e.total_conversions || 0), 0)
  const avgCvr = totalSends > 0 ? ((totalConvs / totalSends) * 100).toFixed(1) : '0.0'

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          🧪 Centralized MAB Experiments & Reporting Hub
        </h1>
        <p style={{ color: '#475569', fontSize: '0.9rem', marginTop: '4px' }}>
          Real-time Multi-Armed Bandit Thompson Sampling performance across Email, SMS, Push Campaigns, and Drip Sequences.
        </p>
      </header>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Active MAB Experiments</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>{experiments.length}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Dispatched Sends</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{totalSends.toLocaleString()}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Conversions</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>{totalConvs.toLocaleString()}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Avg Conversion Rate (CVR)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#9333ea', marginTop: '4px' }}>{avgCvr}%</div>
        </div>
      </div>

      {/* Experiments Table */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Active MAB Journeys</h2>
          <button onClick={fetchSummaries} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
            🔄 Refresh Metrics
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>Loading experiment metrics...</div>
        ) : experiments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
            No active MAB experiments found. Create a campaign or drip sequence with MAB enabled in Next-Admin.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '10px 12px' }}>Experiment Name</th>
                <th style={{ padding: '10px 12px' }}>Type</th>
                <th style={{ padding: '10px 12px' }}>Mode</th>
                <th style={{ padding: '10px 12px' }}>Variants</th>
                <th style={{ padding: '10px 12px' }}>Sends</th>
                <th style={{ padding: '10px 12px' }}>Leading Variant</th>
                <th style={{ padding: '10px 12px' }}>Leading CVR</th>
                <th style={{ padding: '10px 12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map(exp => (
                <tr key={exp.experiment_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{exp.name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {exp.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {exp.mode}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{exp.total_variants}</td>
                  <td style={{ padding: '10px 12px' }}>{exp.total_sends}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#16a34a' }}>
                    {exp.leading_variant_name || 'Sampling...'}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#15803d' }}>
                    {exp.leading_cvr_pct != null ? `${exp.leading_cvr_pct}%` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => openReport(exp)}
                      style={{ padding: '4px 10px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      📊 Inspect Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Variant Details Modal */}
      {selectedExp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  📊 MAB Report: {selectedExp.name}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Thompson Sampling Win Probability & Conversion Funnel</span>
              </div>
              <button onClick={() => setSelectedExp(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {reportLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Calculating Thompson Sampling Beta distributions...</div>
            ) : variantReports.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No variant performance data recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Traffic Allocation Bar */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                    🎯 Current Thompson Sampling Traffic Split
                  </div>
                  <div style={{ display: 'flex', height: '16px', borderRadius: '8px', overflow: 'hidden', background: '#e2e8f0' }}>
                    {variantReports.map((v, i) => {
                      const colors = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626']
                      return (
                        <div
                          key={v.variant_id}
                          style={{ width: `${v.traffic_share_pct || (100 / variantReports.length)}%`, background: colors[i % colors.length] }}
                          title={`${v.variant_name}: ${v.traffic_share_pct}%`}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Variant Funnel Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px' }}>Variant</th>
                      <th style={{ padding: '8px' }}>Send Window</th>
                      <th style={{ padding: '8px' }}>Sends</th>
                      <th style={{ padding: '8px' }}>Clicks</th>
                      <th style={{ padding: '8px' }}>Conversions</th>
                      <th style={{ padding: '8px' }}>CVR %</th>
                      <th style={{ padding: '8px' }}>Win Chance %</th>
                      <th style={{ padding: '8px' }}>Lift vs Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantReports.map((v, i) => (
                      <tr key={v.variant_id} style={{ borderBottom: '1px solid #f1f5f9', background: i === 0 ? '#f0fdf4' : '#ffffff' }}>
                        <td style={{ padding: '8px', fontWeight: 600, color: i === 0 ? '#15803d' : '#1e293b' }}>
                          {i === 0 ? '🏆 ' : ''}{v.variant_name}
                        </td>
                        <td style={{ padding: '8px', fontSize: '0.78rem', color: '#64748b' }}>
                          {v.send_window_start ? `${v.send_window_start.substring(0,5)}-${v.send_window_end.substring(0,5)}` : 'Standard'}
                        </td>
                        <td style={{ padding: '8px' }}>{v.sends_count}</td>
                        <td style={{ padding: '8px' }}>{v.clicks_count}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{v.conversions_count}</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: '#16a34a' }}>{v.cvr_pct}%</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: '#2563eb' }}>{v.win_probability_pct}%</td>
                        <td style={{ padding: '8px', fontWeight: 600, color: v.lift_vs_baseline_pct >= 0 ? '#16a34a' : '#dc2626' }}>
                          {v.lift_vs_baseline_pct >= 0 ? `+${v.lift_vs_baseline_pct}%` : `${v.lift_vs_baseline_pct}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
