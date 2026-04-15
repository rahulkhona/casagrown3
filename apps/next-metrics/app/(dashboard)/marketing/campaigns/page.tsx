'use client'

import { useEffect, useState } from 'react'
import { fetchCrmCampaignStats, type CrmCampaignStatsRow } from '../../../../lib/metrics-service'
import { useFilters } from '../../layout'

export default function MarketingCampaignsPage() {
  const { dateRange } = useFilters()
  const [rows, setRows] = useState<CrmCampaignStatsRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCrmCampaignStats(dateRange).then(d => { setRows(d); setLoading(false) })
  }, [dateRange])

  const totals = {
    sent: rows.reduce((s, r) => s + r.sent, 0),
    opened: rows.reduce((s, r) => s + r.opened, 0),
    clicked: rows.reduce((s, r) => s + r.clicked, 0),
    bounced: rows.reduce((s, r) => s + r.bounced, 0),
  }
  const avgOpenRate = rows.length > 0 ? (rows.reduce((s, r) => s + r.open_rate, 0) / rows.length) : 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Campaign Performance</h1>
        <p className="page-subtitle">Email and SMS campaign send results and engagement metrics</p>
      </div>

      <div className="stats-grid" style={{ marginBottom: 32 }}>
        {[
          { label: 'Total Sent', value: totals.sent.toLocaleString(), icon: '📤' },
          { label: 'Opened', value: totals.opened.toLocaleString(), icon: '👁️', sub: `${avgOpenRate.toFixed(1)}% avg open rate` },
          { label: 'Clicked', value: totals.clicked.toLocaleString(), icon: '👆' },
          { label: 'Bounced', value: totals.bounced.toLocaleString(), icon: '⚠️' },
        ].map((stat, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            {stat.sub && <div className="stat-sub">{stat.sub}</div>}
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="card-title">Campaign Breakdown</h2>
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Channel</th>
              <th>Sent</th>
              <th>Opened</th>
              <th>Open Rate</th>
              <th>Clicked</th>
              <th>Click Rate</th>
              <th>Bounced</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading...</td></tr>
            ) : rows.map(row => (
              <tr key={row.campaign_id}>
                <td className="campaign-name">{row.campaign_name}</td>
                <td>
                  <span className="channel-badge">{row.channel === 'email' ? '📧 Email' : '💬 SMS'}</span>
                </td>
                <td>{row.sent.toLocaleString()}</td>
                <td>{row.opened.toLocaleString()}</td>
                <td>
                  <RateBar value={row.open_rate} max={50} color="#3b82f6" />
                </td>
                <td>{row.clicked.toLocaleString()}</td>
                <td>
                  <RateBar value={row.click_rate} max={30} color="#22c55e" />
                </td>
                <td className={row.bounced > 20 ? 'bounce-high' : 'muted'}>{row.bounced.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .page-header { margin-bottom: 28px; }
        .page-title { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }
        .page-subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; }
        .stat-card { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 22px; }
        .stat-icon { font-size: 1.5rem; margin-bottom: 8px; }
        .stat-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 1.8rem; font-weight: 700; color: var(--text-primary); }
        .stat-sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; }
        .card { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 24px; }
        .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
        .metrics-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .metrics-table th { color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; padding: 0 10px 10px 0; text-align: left; }
        .metrics-table td { padding: 12px 10px 12px 0; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
        .campaign-name { font-weight: 600; }
        .channel-badge { background: var(--surface-hover); border-radius: 8px; padding: 2px 8px; font-size: 0.8rem; }
        .muted { color: var(--text-muted); }
        .bounce-high { color: #ef4444; font-weight: 600; }
        @media (max-width: 900px) { .stats-grid { grid-template-columns: repeat(2,1fr); } }
      `}</style>
    </div>
  )
}

function RateBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 64, height: 6, background: 'var(--surface-hover)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: 6, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{value.toFixed(1)}%</span>
    </div>
  )
}
