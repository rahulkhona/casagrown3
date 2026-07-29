'use client'

import React, { useEffect, useState } from 'react'
import { fetchWizardDropoffs, type WizardDropoffData } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { BarChart, DonutChart, formatNumber } from '../../../lib/charts'

const WIZARDS = [
  { slug: '/create-listing', label: 'Listing Creation Wizard (/create-listing)' },
  { slug: '/create-listing-simple', label: 'Simple Listing Wizard (/create-listing-simple)' },
  { slug: '/create-listing-wizard', label: 'Standard Listing Wizard (/create-listing-wizard)' },
  { slug: '/add-product', label: 'Add Product Wizard (/add-product)' },
  { slug: '/quicksetup', label: 'Quick Setup Wizard (/quicksetup)' },
  { slug: '/join', label: 'Buyer Join Wizard (/join)' },
  { slug: '/sell', label: 'Seller Setup Wizard (/sell)' },
  { slug: '/profile-setup', label: 'Profile Setup Wizard (/profile-setup)' },
  { slug: '/check-nutrition-loss', label: 'Nutrition Loss Calculator Wizard (/check-nutrition-loss)' },
  { slug: '/p/[slug]', label: 'Promotion Onboarding (/p/[slug])' },
]

function fillRateBadge(rate: number) {
  if (rate > 80) {
    return <span className="badge badge-green">{rate.toFixed(1)}%</span>
  }
  if (rate >= 50) {
    return <span className="badge badge-orange">{rate.toFixed(1)}%</span>
  }
  return <span className="badge badge-red">{rate.toFixed(1)}%</span>
}

function formatSecs(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s}s`
}

export function WizardDropoffsView() {
  const { geoFilter, utmFilter } = useFilters()
  const today = new Date().toISOString().split('T')[0]!
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]!
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]!

  const [dateRange, setLocalRange] = useState({ start: fourteenDaysAgo, end: today })
  const [selectedWizard, setSelectedWizard] = useState('/create-listing')
  const [data, setData] = useState<WizardDropoffData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchWizardDropoffs(dateRange, selectedWizard, geoFilter, utmFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [dateRange, selectedWizard, geoFilter, utmFilter])

  const selectedWizardLabel = WIZARDS.find(w => w.slug === selectedWizard)?.label || selectedWizard

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">Wizard Drop-offs</h1>
            <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>⏱️ 14-Day Retention Bound</span>
          </div>
          <p className="page-subtitle">Field-level interactions, fill rates, step timing, and abandon points across all wizards</p>
        </div>

        {/* Wizard & Date Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255, 255, 255, 0.05)', padding: 4, borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setLocalRange({ start: sevenDaysAgo, end: today })}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: dateRange.start === sevenDaysAgo ? 'var(--chart-1)' : 'transparent',
                color: dateRange.start === sevenDaysAgo ? '#000' : 'var(--text-main)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              7 Days
            </button>
            <button
              onClick={() => setLocalRange({ start: fourteenDaysAgo, end: today })}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: dateRange.start === fourteenDaysAgo ? 'var(--chart-1)' : 'transparent',
                color: dateRange.start === fourteenDaysAgo ? '#000' : 'var(--text-main)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              14 Days (Max)
            </button>
          </div>

          {/* Date Picker bounded to 14 days */}
          <input
            type="date"
            min={fourteenDaysAgo}
            max={today}
            value={dateRange.start}
            onChange={e => setLocalRange({ ...dateRange, start: e.target.value })}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
          <input
            type="date"
            min={fourteenDaysAgo}
            max={today}
            value={dateRange.end}
            onChange={e => setLocalRange({ ...dateRange, end: e.target.value })}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
            }}
          />

          <select
            value={selectedWizard}
            onChange={e => setSelectedWizard(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--accent-green)',
              background: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--accent-green)',
              fontSize: '0.85rem',
              fontWeight: 600,
              minWidth: 260,
            }}
          >
            {WIZARDS.map(w => (
              <option key={w.slug} value={w.slug}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="loading-container">
          <div className="spinner" />
          <span>Loading field-level wizard analytics for {selectedWizardLabel}...</span>
        </div>
      ) : (
        <>
          {/* 1. Step-by-Step Funnel Completion */}
          <div className="card glass">
            <div className="chart-header">
              <h2 className="chart-title">Step-by-Step Funnel Completion ({selectedWizardLabel})</h2>
              <span className="badge badge-blue">Unique Sessions</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <BarChart
                data={data.stepFunnel.map(sf => ({ date: sf.stepName, value: sf.visits }))}
                color="var(--chart-1)"
                height={220}
                formatValue={formatNumber}
              />
            </div>
            {/* Consecutive Drop-off percentages */}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {data.stepFunnel.map((s, i) => {
                if (i === 0) return null
                const prev = data.stepFunnel[i - 1]!
                const dropPct = prev.visits > 0
                  ? (((prev.visits - s.visits) / prev.visits) * 100).toFixed(1)
                  : '0.0'
                return (
                  <div key={i} style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 12px',
                    fontSize: '0.8125rem',
                    color: 'var(--accent-red)',
                    fontWeight: 600,
                  }}>
                    Step {prev.step} → {s.step}: <span style={{ fontWeight: 800 }}>−{dropPct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2. FIELD-LEVEL DROP-OFF & FILL RATES */}
          {data.fieldStats.length > 0 && (
            <div className="card glass">
              <div className="chart-header">
                <h2 className="chart-title">📋 Field-Level Drop-off & Interactions</h2>
                <span className="badge badge-purple">Field-Level Granularity</span>
              </div>
              <div className="table-scroll" style={{ marginTop: 16 }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Step</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Field Name</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Interactions</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Filled</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Left Empty</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Validation Errors</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fill Rate %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fieldStats.map((f, i) => {
                      const fillRate = f.interactCount > 0
                        ? ((f.filledCount / f.interactCount) * 100)
                        : 0
                      const errors = data.validationErrors?.filter(ve => ve.step === f.step && ve.fieldName === f.fieldName) || []
                      const totalErrors = errors.reduce((acc, err) => acc + err.errorCount, 0) || f.validationErrorCount || 0
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>Step {f.step}</td>
                          <td style={{ padding: '12px 16px' }}><span className="code">{f.fieldName}</span></td>
                          <td style={{ padding: '12px 16px' }}>{formatNumber(f.interactCount)}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--accent-green)', fontWeight: 600 }}>{formatNumber(f.filledCount)}</td>
                          <td style={{ padding: '12px 16px', color: f.emptyCount > 0 ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: f.emptyCount > 0 ? 700 : 400 }}>
                            {formatNumber(f.emptyCount)}
                          </td>
                          <td style={{ padding: '12px 16px', color: totalErrors > 0 ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: totalErrors > 0 ? 700 : 400 }}>
                            {formatNumber(totalErrors)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {fillRateBadge(fillRate)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. WHERE USERS LEAVE (STEP ABANDON POINTS) */}
          {data.abandonPoints.length > 0 && (
            <div className="card glass">
              <div className="chart-header">
                <h2 className="chart-title">🚪 Where Users Leave (Step Abandon Points)</h2>
                <span className="badge badge-red">Drop-off Bottlenecks</span>
              </div>
              <div className="table-scroll" style={{ marginTop: 16 }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Last Step</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Step Name</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Abandons Count</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Avg Time on Step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.abandonPoints
                      .sort((a, b) => b.abandonCount - a.abandonCount)
                      .map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: i === 0 ? 'rgba(239, 68, 68, 0.05)' : undefined }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                            {i === 0 && <span style={{ marginRight: 6 }}>🔴</span>}
                            Step {a.lastStep}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>{a.lastStepName}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-red)' }}>
                            {formatNumber(a.abandonCount)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>{formatSecs(a.avgTimeOnStepSecs)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. TIME PER STEP & SLOW STEP ALERTS */}
          {data.stepTiming.length > 0 && (
            <div className="card glass">
              <div className="chart-header">
                <h2 className="chart-title">⏱️ Time per Step & Velocity Analysis</h2>
                <span className="badge badge-orange">Friction Detection</span>
              </div>
              <div style={{ marginTop: 16 }}>
                <BarChart
                  data={data.stepTiming.map(s => ({
                    date: `Step ${s.step}`,
                    value: s.avgSecs,
                  }))}
                  color="var(--chart-3)"
                  height={200}
                  formatValue={(n) => formatSecs(n)}
                />
              </div>

              {/* Slow steps warning alert */}
              {data.stepTiming.filter(s => s.avgSecs > 120).length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.stepTiming.filter(s => s.avgSecs > 120).map((s, i) => (
                    <div key={i} style={{
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      color: 'var(--accent-orange)',
                      fontWeight: 600,
                    }}>
                      ⚠️ High Friction Step {s.step} ({s.stepName}): {formatSecs(s.avgSecs)} average dwell time — may require form simplification
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. AI FEATURE ADOPTION & DONUT CHARTS */}
          {data.aiUsage.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>🤖 AI Feature Adoption in Wizard</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                {data.aiUsage.map((ai, i) => {
                  const applyRate = ai.clickCount > 0 ? ((ai.appliedCount / ai.clickCount) * 100).toFixed(1) : '0.0'
                  return (
                    <div key={i} className="card glass">
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                          {ai.buttonName}
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <span>Total Clicks: <strong>{ai.clickCount}</strong></span>
                          <span>Apply Rate: <strong style={{ color: 'var(--accent-green)' }}>{applyRate}%</strong></span>
                        </div>
                      </div>
                      <DonutChart
                        size={120}
                        data={[
                          { label: 'Applied', value: ai.appliedCount, color: 'var(--accent-green)' },
                          { label: 'Dismissed', value: ai.dismissedCount, color: 'var(--accent-orange)' },
                          { label: 'Abandoned Wait', value: ai.abandonWaitCount, color: 'var(--accent-red)' },
                        ]}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 6. BUTTON CLICK ACTIVITY */}
          {data.buttonClicks && data.buttonClicks.length > 0 && (
            <div className="card glass">
              <div className="chart-header">
                <h2 className="chart-title">🖱️ Button Click Activity</h2>
                <span className="badge badge-blue">Action Events</span>
              </div>
              <div className="table-scroll" style={{ marginTop: 16 }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Step</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Button Name</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buttonClicks.map((b, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Step {b.step}</td>
                        <td style={{ padding: '12px 16px' }}><span className="code">{b.buttonName}</span></td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-green)' }}>{formatNumber(b.clickCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
