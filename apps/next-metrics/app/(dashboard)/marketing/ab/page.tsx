'use client'

import { useEffect, useState } from 'react'
import { fetchCrmAbResults, type CrmAbResult } from '../../../../lib/metrics-service'
import { useFilters } from '../../layout'

export default function MarketingAbPage() {
  const { dateRange } = useFilters()
  const [rows, setRows] = useState<CrmAbResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCrmAbResults(dateRange).then(d => { setRows(d); setLoading(false) })
  }, [dateRange])

  // Group by page_slug
  const byPage = rows.reduce<Record<string, CrmAbResult[]>>((acc, r) => {
    if (!acc[r.page_slug]) acc[r.page_slug] = []
    acc[r.page_slug].push(r)
    return acc
  }, {})

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Landing Page A/B Test Results</h1>
        <p className="page-subtitle">Landing page variant performance comparison</p>
      </div>

      {loading ? (
        <div className="loading-msg">Loading...</div>
      ) : Object.entries(byPage).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔬</div>
          <p>No A/B test data yet. Set up landing page variants to compare conversion rates.</p>
        </div>
      ) : Object.entries(byPage).map(([slug, variants]) => {
        const maxRate = Math.max(...variants.map(v => v.conversion_rate))
        const winner = variants.find(v => v.conversion_rate === maxRate)
        return (
          <div key={slug} className="ab-card">
            <div className="ab-card-header">
              <h2 className="ab-slug">{slug}</h2>
              {winner && (
                <span className="winner-badge">
                  🏆 Variant {winner.variant} wins
                </span>
              )}
            </div>

            <div className="ab-variants">
              {variants.sort((a, b) => a.variant.localeCompare(b.variant)).map(v => {
                const isWinner = v.conversion_rate === maxRate
                const relLift = variants.length > 1 && !isWinner
                  ? ((maxRate - v.conversion_rate) / v.conversion_rate * 100).toFixed(1)
                  : null
                return (
                  <div key={v.variant} className={`ab-variant ${isWinner ? 'winner' : ''}`}>
                    <div className="ab-variant-header">
                      <span className="variant-label">Variant {v.variant}</span>
                      {isWinner && <span className="winner-tag">Winner</span>}
                    </div>
                    <div className="ab-stats">
                      <div className="ab-stat">
                        <div className="ab-stat-label">Visits</div>
                        <div className="ab-stat-value">{v.visits.toLocaleString()}</div>
                      </div>
                      <div className="ab-stat">
                        <div className="ab-stat-label">Conversions</div>
                        <div className="ab-stat-value">{v.conversions.toLocaleString()}</div>
                      </div>
                      <div className="ab-stat">
                        <div className="ab-stat-label">Conv. Rate</div>
                        <div className="ab-stat-value conv-rate" style={{ color: isWinner ? '#22c55e' : 'var(--text-primary)' }}>
                          {v.conversion_rate.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="ab-bar-wrap">
                      <div
                        className="ab-bar"
                        style={{
                          width: `${(v.conversion_rate / maxRate) * 100}%`,
                          background: isWinner
                            ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
                            : 'rgba(100,130,100,0.3)',
                        }}
                      />
                    </div>
                    {relLift && (
                      <div className="ab-lift">–{relLift}% lower than winner</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <style jsx>{`
        .page-header { margin-bottom: 28px; }
        .page-title { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }
        .page-subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }
        .loading-msg { color: var(--text-muted); padding: 48px; text-align: center; }
        .empty-state { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 64px; text-align: center; color: var(--text-muted); }
        .empty-icon { font-size: 3rem; margin-bottom: 16px; }
        .ab-card { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .ab-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .ab-slug { font-size: 1.1rem; font-weight: 600; font-family: monospace; color: var(--text-primary); }
        .winner-badge { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); color: #22c55e; border-radius: 20px; padding: 4px 14px; font-size: 0.85rem; font-weight: 600; }
        .ab-variants { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .ab-variant { background: var(--surface-hover); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px; transition: border-color 0.2s; }
        .ab-variant.winner { border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.04); }
        .ab-variant-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .variant-label { font-weight: 700; font-size: 1rem; color: var(--text-primary); }
        .winner-tag { background: #22c55e; color: white; border-radius: 10px; padding: 2px 10px; font-size: 0.75rem; font-weight: 600; }
        .ab-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 16px; }
        .ab-stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; }
        .ab-stat-value { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
        .ab-stat-value.conv-rate { font-size: 1.4rem; }
        .ab-bar-wrap { background: var(--surface-card); border-radius: 4px; height: 8px; overflow: hidden; }
        .ab-bar { height: 8px; border-radius: 4px; transition: width 0.5s ease; }
        .ab-lift { font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; }
      `}</style>
    </div>
  )
}
