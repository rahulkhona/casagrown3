'use client'

import { useState, useEffect } from 'react'
import { useFilters } from '../../layout'
import { fetchWizardFieldAnalytics, fetchActivePromotionPaths, type WizardFieldAnalyticsData } from '../../../../lib/metrics-service'
import { HBarChart, BarChart, DonutChart } from '../../../../lib/charts'

const WIZARDS = [
  { slug: '/create-listing', label: 'Listing Creation Wizard' },
  { slug: '/join', label: 'Buyer Join Wizard' },
  { slug: '/sell', label: 'Seller Setup Wizard' },
  { slug: '/profile-setup', label: 'Profile Setup Wizard' },
  { slug: '/check-nutrition-loss', label: 'Nutrition Loss Calculator Wizard' },
  { slug: '/p/[slug]', label: 'Pro Promotion Onboarding' },
]

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
      <p style={{ fontSize: 16 }}>No field-level analytics data yet.</p>
      <p style={{ fontSize: 14 }}>Data will appear as users interact with this wizard.</p>
    </div>
  )
}

function CardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 20, padding: 24, marginBottom: 24, border: '1px solid var(--border-subtle)', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)' }}>
      {children}
    </div>
  )
}

function fillRateColor(rate: number): string {
  if (rate > 80) return '#16a34a'
  if (rate >= 50) return '#eab308'
  return '#ef4444'
}

function formatSecs(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s}s`
}

export default function WizardAnalyticsPage() {
  const { dateRange, geoFilter, utmFilter } = useFilters()
  const [selectedWizard, setSelectedWizard] = useState<string>('/create-listing')
  const [promoPaths, setPromoPaths] = useState<string[]>([])
  const [selectedPromoPath, setSelectedPromoPath] = useState<string>('/p/[slug]')
  const [data, setData] = useState<WizardFieldAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (selectedWizard === '/p/[slug]') {
      fetchActivePromotionPaths().then(paths => {
        setPromoPaths(paths)
      })
    } else {
      setPromoPaths([])
    }
  }, [selectedWizard])

  useEffect(() => {
    setLoading(true)
    const querySlug = selectedWizard === '/p/[slug]' ? selectedPromoPath : selectedWizard
    fetchWizardFieldAnalytics(dateRange, querySlug, geoFilter, utmFilter).then(res => {
      setData(res)
      setLoading(false)
    })
  }, [dateRange, selectedWizard, selectedPromoPath, geoFilter, utmFilter])

  const wizardLabel = WIZARDS.find(w => w.slug === selectedWizard)?.label || selectedWizard
  const hasData = data && (
    data.stepFunnel.length > 0 ||
    data.fieldInteractions.length > 0 ||
    data.aiUsage.length > 0 ||
    data.abandonPoints.length > 0 ||
    data.stepTiming.length > 0
  )

  return (
    <div className="container">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">🧙 Wizard Analytics</h1>
            <p className="page-subtitle">Field-level interactions, AI adoption, step timing, and abandon analysis</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Wizard:</span>
              <select
                value={selectedWizard}
                onChange={(e) => {
                  setSelectedWizard(e.target.value)
                  setSelectedPromoPath('/p/[slug]') // reset to combined on wizard change
                }}
                className="wizard-select"
              >
                {WIZARDS.map(w => (
                  <option key={w.slug} value={w.slug}>{w.label}</option>
                ))}
              </select>
            </div>

            {selectedWizard === '/p/[slug]' && promoPaths.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Path Instance:</span>
                <select
                  value={selectedPromoPath}
                  onChange={(e) => setSelectedPromoPath(e.target.value)}
                  className="wizard-select"
                >
                  <option value="/p/[slug]">All /p/[slug] (Combined)</option>
                  {promoPaths.map(path => (
                    <option key={path} value={path}>{path}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-card">
          <div className="spinner" />
          <p>Loading wizard analytics for {wizardLabel}...</p>
        </div>
      ) : !hasData ? (
        <CardWrapper><EmptyState /></CardWrapper>
      ) : (
        <>
          {/* Section A: Step Funnel */}
          {data!.stepFunnel.length > 0 && (
            <>
              <div className="section-title">🔽 Step Funnel</div>
              <CardWrapper>
                <HBarChart
                  data={data!.stepFunnel.map(s => ({
                    label: `Step ${s.step}: ${s.step_name}`,
                    value: s.unique_sessions,
                  }))}
                  color="#16a34a"
                />
                {/* Drop-off percentages between consecutive steps */}
                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {data!.stepFunnel.map((s, i) => {
                    if (i === 0) return null
                    const prev = data!.stepFunnel[i - 1]!
                    const dropPct = prev.unique_sessions > 0
                      ? (((prev.unique_sessions - s.unique_sessions) / prev.unique_sessions) * 100).toFixed(1)
                      : '0.0'
                    return (
                      <div key={i} style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.15)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: '0.8125rem',
                        color: '#ef4444',
                        fontWeight: 600,
                      }}>
                        Step {prev.step} → {s.step}: <span style={{ fontWeight: 800 }}>−{dropPct}%</span>
                      </div>
                    )
                  })}
                </div>
              </CardWrapper>
            </>
          )}

          {/* Section: Button Click Activity */}
          {data!.buttonClicks && data!.buttonClicks.length > 0 && (
            <>
              <div className="section-title">🖱️ Button Click Activity</div>
              <CardWrapper>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Button Name</th>
                        <th>Total Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.buttonClicks.map((b, i) => (
                        <tr key={i}>
                          <td className="font-semibold">{b.step}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{b.button_name}</td>
                          <td style={{ fontWeight: 700 }}>{b.click_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardWrapper>
            </>
          )}

          {/* Section B: Field-Level Drop-off */}
          {data!.fieldInteractions.length > 0 && (
            <>
              <div className="section-title">📋 Field-Level Drop-off</div>
              <CardWrapper>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Field</th>
                        <th>Interactions</th>
                        <th>Filled</th>
                        <th>Left Empty</th>
                        <th>Validation Errors</th>
                        <th>Fill Rate %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.fieldInteractions.map((f, i) => {
                        const fillRate = f.interact_count > 0
                          ? ((f.filled_count / f.interact_count) * 100)
                          : 0
                        const errors = data!.validationErrors?.filter(ve => ve.step === f.step && ve.field_name === f.field_name) || []
                        const totalErrors = errors.reduce((acc, err) => acc + err.error_count, 0)
                        return (
                          <tr key={i}>
                            <td className="font-semibold">{f.step}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{f.field_name}</td>
                            <td>{f.interact_count}</td>
                            <td className="text-success">{f.filled_count}</td>
                            <td style={{ color: f.empty_count > 0 ? '#ef4444' : 'var(--text-muted)' }}>{f.empty_count}</td>
                            <td style={{ color: totalErrors > 0 ? '#ef4444' : 'var(--text-muted)' }}>{totalErrors}</td>
                            <td>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: fillRateColor(fillRate),
                                background: fillRate > 80
                                  ? 'rgba(22,163,74,0.1)'
                                  : fillRate >= 50
                                    ? 'rgba(234,179,8,0.1)'
                                    : 'rgba(239,68,68,0.1)',
                                border: `1px solid ${fillRate > 80
                                  ? 'rgba(22,163,74,0.2)'
                                  : fillRate >= 50
                                    ? 'rgba(234,179,8,0.2)'
                                    : 'rgba(239,68,68,0.2)'}`,
                              }}>
                                {fillRate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardWrapper>
            </>
          )}

          {/* Section C: AI Feature Adoption */}
          {data!.aiUsage.length > 0 && (
            <>
              <div className="section-title">🤖 AI Feature Adoption</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
                {data!.aiUsage.map((ai, i) => {
                  const applyRate = ai.click_count > 0 ? ((ai.applied_count / ai.click_count) * 100).toFixed(1) : '0.0'
                  return (
                    <CardWrapper key={i}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                          {ai.button_name}
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          <span>Clicks: <strong style={{ color: 'var(--text-primary)' }}>{ai.click_count}</strong></span>
                          <span>Apply Rate: <strong style={{ color: '#16a34a' }}>{applyRate}%</strong></span>
                        </div>
                      </div>
                      <DonutChart
                        size={100}
                        data={[
                          { label: 'Applied', value: ai.applied_count, color: '#16a34a' },
                          { label: 'Dismissed', value: ai.dismissed_count, color: '#f59e0b' },
                          { label: 'Abandoned', value: ai.abandon_wait_count, color: '#ef4444' },
                        ]}
                      />
                    </CardWrapper>
                  )
                })}
              </div>
            </>
          )}

          {/* Section D: Where Users Leave */}
          {data!.abandonPoints.length > 0 && (
            <>
              <div className="section-title">🚪 Where Users Leave</div>
              <CardWrapper>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Last Step</th>
                        <th>Step Name</th>
                        <th>Abandons</th>
                        <th>Avg Time on Step</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.abandonPoints
                        .sort((a, b) => b.abandon_count - a.abandon_count)
                        .map((a, i) => (
                          <tr key={i} style={i < 3 ? { background: 'rgba(239,68,68,0.04)' } : undefined}>
                            <td className="font-semibold">
                              {i < 3 && <span style={{ marginRight: 6 }}>🔴</span>}
                              {a.last_step}
                            </td>
                            <td>{a.last_step_name}</td>
                            <td style={{ fontWeight: 700, color: i < 3 ? '#ef4444' : 'var(--text-primary)' }}>
                              {a.abandon_count}
                            </td>
                            <td>{formatSecs(a.avg_time_on_step_secs)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardWrapper>
            </>
          )}

          {/* Section E: Time per Step */}
          {data!.stepTiming.length > 0 && (
            <>
              <div className="section-title">⏱️ Time per Step</div>
              <CardWrapper>
                <BarChart
                  data={data!.stepTiming.map(s => ({
                    date: `Step ${s.step}`,
                    value: s.avg_secs,
                  }))}
                  color="#6366f1"
                  height={220}
                  formatValue={(n) => formatSecs(n)}
                />
                {/* Flag slow steps */}
                {data!.stepTiming.filter(s => s.avg_secs > 120).length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {data!.stepTiming.filter(s => s.avg_secs > 120).map((s, i) => (
                      <div key={i} style={{
                        background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: '0.8125rem',
                        color: '#d97706',
                        fontWeight: 600,
                      }}>
                        ⚠️ Step {s.step} ({s.step_name}): {formatSecs(s.avg_secs)} avg — may need simplification
                      </div>
                    ))}
                  </div>
                )}
                {/* Detail table */}
                <div className="table-scroll" style={{ marginTop: 20 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Name</th>
                        <th>Sessions</th>
                        <th>Avg Time</th>
                        <th>Median Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.stepTiming.map((s, i) => (
                        <tr key={i} style={s.avg_secs > 120 ? { background: 'rgba(245,158,11,0.05)' } : undefined}>
                          <td className="font-semibold">{s.step}</td>
                          <td>{s.step_name}</td>
                          <td>{s.session_count}</td>
                          <td style={{ fontWeight: 600, color: s.avg_secs > 120 ? '#d97706' : 'var(--text-primary)' }}>
                            {formatSecs(s.avg_secs)}
                          </td>
                          <td>{formatSecs(s.median_secs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardWrapper>
            </>
          )}
        </>
      )}

      <style jsx>{`
        .container {
          padding-bottom: 60px;
        }
        .page-header {
          margin-bottom: 32px;
        }
        .page-title {
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.025em;
        }
        .page-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-top: 6px;
        }
        .wizard-select {
          background: var(--surface-card);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 600;
          outline: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .wizard-select:hover {
          border-color: #16a34a;
        }
        .loading-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
          background: var(--surface-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          color: var(--text-muted);
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(22,163,74,0.15);
          border-top-color: #16a34a;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 16px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .section-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 40px 0 20px 0;
          border-bottom: 2px solid var(--border-subtle);
          padding-bottom: 8px;
        }
        .table-scroll {
          overflow-x: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
          text-align: left;
        }
        .table th {
          position: sticky;
          top: 0;
          background: var(--surface-card);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.78rem;
          text-transform: uppercase;
          padding: 10px 12px 10px 0;
          border-bottom: 2px solid var(--border-subtle);
        }
        .table td {
          padding: 12px 12px 12px 0;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
        }
        .table tr:last-child td {
          border-bottom: none;
        }
        .font-semibold { font-weight: 600; }
        .text-success { color: #16a34a; }
        .text-muted { color: var(--text-muted); }
      `}</style>
    </div>
  )
}
