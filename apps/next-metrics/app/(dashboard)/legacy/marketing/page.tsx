'use client'

import { useEffect, useState } from 'react'
import { fetchCrmTraffic, fetchCrmTrafficSources, type CrmTrafficRow } from '../../../../lib/metrics-service'
import { useFilters } from '../../layout'

export default function MarketingTrafficPage() {
  const { dateRange } = useFilters()
  const [traffic, setTraffic] = useState<CrmTrafficRow[]>([])
  const [sources, setSources] = useState<{ source: string; visits: number; pct: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchCrmTraffic(dateRange),
      fetchCrmTrafficSources(dateRange),
    ]).then(([t, s]) => {
      setTraffic(t)
      setSources(s)
      setLoading(false)
    })
  }, [dateRange])

  const totalVisits = traffic.reduce((s, r) => s + r.visits, 0)
  const totalConversions = traffic.reduce((s, r) => s + r.conversions, 0)
  const avgDuration = traffic.length > 0
    ? Math.round(traffic.reduce((s, r) => s + r.avg_duration_secs, 0) / traffic.length)
    : 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Marketing Traffic</h1>
        <p className="page-subtitle">Landing page performance and visitor sources</p>
      </div>

      {loading ? (
        <div className="loading-grid">
          {[1,2,3].map(i => <div key={i} className="stat-card skeleton" />)}
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
            <div className="stat-card">
              <div className="stat-label">Total Visits</div>
              <div className="stat-value">{totalVisits.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Conversions</div>
              <div className="stat-value accent">{totalConversions.toLocaleString()}</div>
              <div className="stat-sub">{totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(1) : 0}% overall rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Session Duration</div>
              <div className="stat-value">{avgDuration}s</div>
            </div>
          </div>

          <div className="two-col-grid">
            {/* Traffic by page */}
            <div className="card">
              <h2 className="card-title">By Landing Page</h2>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Visits</th>
                    <th>Duration</th>
                    <th>Conversions</th>
                    <th>Rate</th>
                    <th>Top Source</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.map(row => (
                    <tr key={row.page_slug}>
                      <td className="mono">{row.page_slug}</td>
                      <td>{row.visits.toLocaleString()}</td>
                      <td>{row.avg_duration_secs}s</td>
                      <td>{row.conversions}</td>
                      <td>
                        <span className="rate-badge" style={{ background: row.conversion_rate > 10 ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.1)', color: row.conversion_rate > 10 ? '#16a34a' : '#3b82f6' }}>
                          {row.conversion_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="muted">{row.top_utm_source || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Traffic Sources */}
            <div className="card">
              <h2 className="card-title">Traffic Sources</h2>
              <div className="sources-list">
                {sources.map(s => (
                  <div key={s.source} className="source-row">
                    <div className="source-label">{s.source}</div>
                    <div className="source-bar-wrap">
                      <div className="source-bar" style={{ width: `${s.pct}%` }} />
                    </div>
                    <div className="source-pct">{s.pct}%</div>
                    <div className="source-visits">{s.visits.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .page-header { margin-bottom: 28px; }
        .page-title { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }
        .page-subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }
        .stats-grid { display: grid; gap: 20px; }
        .stat-card { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 24px; }
        .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 2rem; font-weight: 700; color: var(--text-primary); }
        .stat-value.accent { color: var(--accent-green); }
        .stat-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
        .skeleton { height: 100px; background: var(--surface-hover); animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .loading-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; margin-bottom: 32px; }
        .two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .card { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 24px; }
        .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
        .metrics-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .metrics-table th { color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; padding: 0 12px 10px 0; text-align: left; }
        .metrics-table td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
        .mono { font-family: monospace; font-size: 0.82rem; }
        .muted { color: var(--text-muted); }
        .rate-badge { border-radius: 12px; padding: 2px 8px; font-size: 0.8rem; font-weight: 600; }
        .sources-list { display: flex; flex-direction: column; gap: 14px; }
        .source-row { display: grid; grid-template-columns: 80px 1fr 40px 60px; gap: 10px; align-items: center; }
        .source-label { color: var(--text-primary); font-size: 0.9rem; text-transform: capitalize; }
        .source-bar-wrap { background: var(--surface-hover); border-radius: 4px; height: 8px; overflow: hidden; }
        .source-bar { height: 8px; background: linear-gradient(90deg, #4ade80, #22d3ee); border-radius: 4px; transition: width 0.5s ease; }
        .source-pct { color: var(--text-muted); font-size: 0.85rem; text-align: right; }
        .source-visits { color: var(--text-muted); font-size: 0.85rem; text-align: right; }
        @media (max-width: 900px) { .two-col-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
