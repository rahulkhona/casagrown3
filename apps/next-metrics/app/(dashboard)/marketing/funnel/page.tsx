'use client'

import { useEffect, useState } from 'react'
import { fetchCrmLeadFunnel, type CrmLeadFunnelRow } from '../../../../lib/metrics-service'
import { useFilters } from '../../layout'

export default function MarketingFunnelPage() {
  const { dateRange } = useFilters()
  const [rows, setRows] = useState<CrmLeadFunnelRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCrmLeadFunnel(dateRange)
      .then(d => { setRows(d); setLoading(false) })
      .catch(err => {
        console.error('Failed to fetch CRM lead funnel:', err)
        setLoading(false)
      })
  }, [dateRange])

  const totals = {
    leads: rows.reduce((s, r) => s + r.leads, 0),
    contacted: rows.reduce((s, r) => s + r.contacted, 0),
    converted: rows.reduce((s, r) => s + r.converted, 0),
  }

  const overallRate = totals.leads > 0 ? ((totals.converted / totals.leads) * 100).toFixed(1) : '0'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Lead Conversion Funnel</h1>
        <p className="page-subtitle">Track leads from capture through conversion, by source</p>
      </div>

      {/* Funnel totals */}
      <div className="funnel-overview">
        {[
          { label: 'Total Leads', value: totals.leads, color: '#3b82f6', pct: 100 },
          { label: 'Contacted', value: totals.contacted, color: '#f59e0b', pct: totals.leads > 0 ? Math.round((totals.contacted / totals.leads) * 100) : 0 },
          { label: 'Converted', value: totals.converted, color: '#22c55e', pct: totals.leads > 0 ? Math.round((totals.converted / totals.leads) * 100) : 0 },
        ].map((stage, i) => (
          <div key={i} className="funnel-stage">
            <div className="funnel-bar-wrap">
              <div className="funnel-bar" style={{ width: `${stage.pct}%`, background: stage.color }} />
            </div>
            <div className="funnel-stage-info">
              <span className="funnel-label">{stage.label}</span>
              <span className="funnel-value" style={{ color: stage.color }}>{stage.value.toLocaleString()}</span>
              <span className="funnel-pct">{stage.pct}%</span>
            </div>
          </div>
        ))}
        <div className="funnel-rate-badge">
          Overall conversion rate: <strong>{overallRate}%</strong>
        </div>
      </div>

      {/* By source table */}
      <div className="card">
        <h2 className="card-title">By Traffic Source</h2>
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Leads</th>
              <th>Contacted</th>
              <th>Converted</th>
              <th>Conversion Rate</th>
              <th>Contact Rate</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading...</td></tr>
            ) : rows.map(row => (
              <tr key={row.source}>
                <td className="source-name">{row.source}</td>
                <td>{row.leads.toLocaleString()}</td>
                <td>{row.contacted.toLocaleString()}</td>
                <td>{row.converted.toLocaleString()}</td>
                <td>
                  <div className="rate-bar-wrap">
                    <div className="rate-bar" style={{ width: `${Math.min(row.conversion_rate * 5, 100)}%` }} />
                    <span className="rate-label">{row.conversion_rate.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="muted">
                  {row.leads > 0 ? ((row.contacted / row.leads) * 100).toFixed(0) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .page-header { margin-bottom: 28px; }
        .page-title { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }
        .page-subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }
        .funnel-overview { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 28px; margin-bottom: 28px; }
        .funnel-stage { margin-bottom: 18px; }
        .funnel-bar-wrap { background: var(--surface-hover); border-radius: 8px; height: 12px; margin-bottom: 8px; overflow: hidden; }
        .funnel-bar { height: 12px; border-radius: 8px; transition: width 0.6s ease; }
        .funnel-stage-info { display: flex; gap: 16px; align-items: center; }
        .funnel-label { flex: 1; color: var(--text-primary); font-size: 0.9rem; font-weight: 500; }
        .funnel-value { font-size: 1.2rem; font-weight: 700; }
        .funnel-pct { color: var(--text-muted); font-size: 0.85rem; min-width: 40px; text-align: right; }
        .funnel-rate-badge { margin-top: 16px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2); border-radius: 8px; padding: 10px 16px; color: var(--text-primary); font-size: 0.9rem; }
        .funnel-rate-badge strong { color: #22c55e; }
        .card { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 24px; }
        .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
        .metrics-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .metrics-table th { color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; padding: 0 12px 10px 0; text-align: left; }
        .metrics-table td { padding: 12px 12px 12px 0; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
        .source-name { font-weight: 600; text-transform: capitalize; }
        .muted { color: var(--text-muted); }
        .rate-bar-wrap { display: flex; align-items: center; gap: 8px; }
        .rate-bar { height: 6px; background: linear-gradient(90deg, #4ade80, #22d3ee); border-radius: 3px; min-width: 4px; }
        .rate-label { font-size: 0.85rem; color: var(--text-primary); font-weight: 600; white-space: nowrap; }
      `}</style>
    </div>
  )
}
