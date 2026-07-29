'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../../layout'
import { fetchSettlementSummary, type SettlementData } from '../../../../lib/metrics-service'
import { StackedBarChart, formatNumber, formatCurrency } from '../../../../lib/charts'

export default function SettlementsPage() {
  const { dateRange } = useFilters()
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSettlementSummary(dateRange).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading settlement data...</span></div>
  }

  const totalCaptured = data.dailySummary.reduce((s, d) => s + d.captured, 0)
  const totalRefunded = data.dailySummary.reduce((s, d) => s + d.refunded, 0)

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Settlements</h1>
        <p className="page-subtitle">Daily clearing summaries, payouts, and revenue breakdown</p>
      </div>

      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">Total Captured</span>
          <span className="kpi-value">{formatCurrency(totalCaptured)}</span>
        </div>
        <div className="kpi-card blue">
          <span className="kpi-label">Total Payouts</span>
          <span className="kpi-value">{formatCurrency(data.payoutTotals)}</span>
        </div>
        <div className="kpi-card orange">
          <span className="kpi-label">Total Refunded</span>
          <span className="kpi-value">{formatCurrency(totalRefunded)}</span>
        </div>
        <div className="kpi-card purple">
          <span className="kpi-label">Net Revenue</span>
          <span className="kpi-value">{formatCurrency(totalCaptured - data.payoutTotals - totalRefunded)}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">Daily Clearing Summary</div>
        <StackedBarChart
          data={data.dailySummary.map(d => ({
            date: d.date,
            values: {
              'Captured': d.captured,
              'Released': d.released,
              'Refunded': d.refunded,
            },
          }))}
          colors={{
            'Captured': 'var(--chart-2)',
            'Released': 'var(--chart-1)',
            'Refunded': 'var(--chart-5)',
          }}
          height={260}
        />
      </div>

      <div className="card">
        <div className="chart-title">Recent Settlements</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Orders</th>
                <th>Captured</th>
                <th>Payouts</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSettlements.map((s, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-primary)' }}>{s.date}</td>
                  <td>
                    <span className={`badge ${s.status === 'completed' ? 'badge-green' : 'badge-orange'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{formatNumber(s.orders)}</td>
                  <td>{formatCurrency(s.captured)}</td>
                  <td>{s.payouts > 0 ? formatCurrency(s.payouts) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
