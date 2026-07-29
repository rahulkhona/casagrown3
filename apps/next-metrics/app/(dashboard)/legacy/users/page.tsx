'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../../layout'
import { fetchUserGrowth, type UserGrowthData } from '../../../../lib/metrics-service'
import { BarChart, LineChart, HBarChart, formatNumber } from '../../../../lib/charts'

export default function UsersPage() {
  const { dateRange, granularity, geoFilter } = useFilters()
  const [data, setData] = useState<UserGrowthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchUserGrowth(dateRange, granularity, geoFilter).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange, granularity, geoFilter])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading user growth data...</span></div>
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">User Growth</h1>
        <p className="page-subtitle">New user registrations and geographic distribution</p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card blue">
          <span className="kpi-label">Total Users</span>
          <span className="kpi-value">{formatNumber(data.total)}</span>
        </div>
        <div className="kpi-card green">
          <span className="kpi-label">New This Period</span>
          <span className="kpi-value">{formatNumber(data.newInPeriod)}</span>
        </div>
        <div className="kpi-card purple">
          <span className="kpi-label">Avg Daily Signups</span>
          <span className="kpi-value">{formatNumber(Math.round(data.newInPeriod / data.timeSeries.length))}</span>
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">New User Growth</div>
          <BarChart data={data.timeSeries} color="var(--chart-1)" height={220} />
        </div>
        <div className="card">
          <div className="chart-title">Cumulative Users</div>
          <LineChart data={data.cumulative} color="var(--chart-2)" height={220} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">User Acquisition by Region</div>
        <HBarChart
          data={data.byGeo.map(g => ({ label: g.region, value: g.count }))}
          color="var(--chart-4)"
        />
      </div>

      <div className="card">
        <div className="chart-title">Geographic Breakdown</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Region</th>
                <th>New Users</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.byGeo.map((g, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{g.region}</td>
                  <td>{formatNumber(g.count)}</td>
                  <td>{((g.count / data.newInPeriod) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
