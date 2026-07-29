'use client'

import { Suspense, useEffect, useState } from 'react'
import { fetchCrmCampaignStats, type CrmCampaignStatsRow } from '../../../../../lib/metrics-service'
import { useFilters } from '../../../layout'

export const dynamic = 'force-dynamic'

function MarketingCampaignsContent() {
  const { dateRange } = useFilters()
  const [rows, setRows] = useState<CrmCampaignStatsRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCrmCampaignStats(dateRange)
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(e => { console.error(e); setRows([]); setLoading(false) })
  }, [dateRange])

  const safeRows = Array.isArray(rows) ? rows : []
  const totals = {
    sent: safeRows.reduce((s, r) => s + (Number(r?.sent) || 0), 0),
    opened: safeRows.reduce((s, r) => s + (Number(r?.opened) || 0), 0),
    clicked: safeRows.reduce((s, r) => s + (Number(r?.clicked) || 0), 0),
    bounced: safeRows.reduce((s, r) => s + (Number(r?.bounced) || 0), 0),
  }
  const avgOpenRate = safeRows.length > 0 ? (safeRows.reduce((s, r) => s + (Number(r?.open_rate) || 0), 0) / safeRows.length) : 0

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
            ) : safeRows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No campaigns found.</td></tr>
            ) : safeRows.map((row, idx) => (
              <tr key={row?.campaign_id || idx}>
                <td className="campaign-name">{row?.campaign_name || 'Campaign'}</td>
                <td>
                  <span className="channel-badge">{row?.channel === 'email' ? '📧 Email' : '💬 SMS'}</span>
                </td>
                <td>{(Number(row?.sent) || 0).toLocaleString()}</td>
                <td>{(Number(row?.opened) || 0).toLocaleString()}</td>
                <td>
                  <RateBar value={Number(row?.open_rate) || 0} max={50} color="#3b82f6" />
                </td>
                <td>{(Number(row?.clicked) || 0).toLocaleString()}</td>
                <td>
                  <RateBar value={Number(row?.click_rate) || 0} max={25} color="#10b981" />
                </td>
                <td>{(Number(row?.bounced) || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RateBar({ value, max, color }: { value?: number; max: number; color: string }) {
  const val = typeof value === 'number' && !isNaN(value) ? value : 0
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.8rem', color: '#64748b', minWidth: 36 }}>{val.toFixed(1)}%</span>
    </div>
  )
}

export default function MarketingCampaignsPage() {
  return (
    <Suspense fallback={<div>Loading Campaign Performance...</div>}>
      <MarketingCampaignsContent />
    </Suspense>
  )
}
