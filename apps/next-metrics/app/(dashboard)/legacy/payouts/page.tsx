'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../../layout'
import { fetchPayoutTrends, type PayoutData } from '../../../../lib/metrics-service'
import { StackedBarChart, DonutChart, formatNumber, formatCurrency } from '../../../../lib/charts'

export default function PayoutsPage() {
  const { dateRange, geoFilter } = useFilters()
  const [data, setData] = useState<PayoutData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPayoutTrends(dateRange, geoFilter).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange, geoFilter])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading payout data...</span></div>
  }

  const stackedData = data.methodTrends.map(t => ({
    date: t.date,
    values: {
      'Gift Cards': t.giftcards,
      'Charity Donation': t.charity,
      'Cash Out ($)': t.cashout,
    },
  }))

  // Group instruments by method for the breakdown table
  const methodGroups = new Map<string, typeof data.instrumentTotals>()
  for (const inst of data.instrumentTotals) {
    const arr = methodGroups.get(inst.method) || []
    arr.push(inst)
    methodGroups.set(inst.method, arr)
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Payouts</h1>
        <p className="page-subtitle">Earnings payout methods, instruments, and success rates</p>
      </div>

      <div className="kpi-grid stagger">
        {data.methodTotals.map((m, i) => (
          <div key={i} className={`kpi-card ${['blue', 'green', 'orange'][i]}`}>
            <span className="kpi-label">{m.method}</span>
            <span className="kpi-value">{formatCurrency(m.amount)}</span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{formatNumber(m.count)} payouts</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">Payout Method Trends</div>
        <StackedBarChart
          data={stackedData}
          colors={{
            'Gift Cards': 'var(--chart-1)',
            'Charity Donation': 'var(--chart-2)',
            'Cash Out ($)': 'var(--chart-3)',
          }}
          height={240}
        />
      </div>

      {/* Instrument Breakdown Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">Instrument Breakdown</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Each payout method broken down by provider / instrument
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Instrument / Provider</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Count</th>
                <th style={{ textAlign: 'right' }}>% of Method</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(methodGroups.entries()).map(([method, instruments]) => (
                instruments.map((inst, j) => (
                  <tr key={`${method}-${j}`}>
                    {j === 0 ? (
                      <td rowSpan={instruments.length} style={{ fontWeight: 600, color: 'var(--text-primary)', verticalAlign: 'top' }}>
                        {method}
                      </td>
                    ) : null}
                    <td>
                      <span className="mono" style={{ fontSize: '0.8125rem', color: 'var(--accent-blue-light)' }}>
                        {inst.instrument}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inst.amount)}</td>
                    <td style={{ textAlign: 'right' }}>{formatNumber(inst.count)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {(() => {
                        const methodTotal = data.methodTotals.find(m => m.method === method)
                        return methodTotal ? `${Math.round((inst.amount / methodTotal.amount) * 100)}%` : '—'
                      })()}
                    </td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Volume by Method</div>
          <DonutChart
            data={data.methodTotals.map((m, i) => ({
              label: m.method,
              value: m.amount,
              color: [`var(--chart-1)`, `var(--chart-2)`, `var(--chart-3)`][i]!,
            }))}
            size={140}
          />
        </div>
        <div className="card">
          <div className="chart-title">Success / Failure Rates</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.successRates.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{s.method}</span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--accent-green)' }}>{s.success}% success</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${s.success}%`, background: 'var(--accent-green)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                  <div style={{ width: `${s.failure}%`, background: 'var(--accent-red)', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
