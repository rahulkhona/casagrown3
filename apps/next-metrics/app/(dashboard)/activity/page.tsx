'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../layout'
import { fetchPageAnalytics, type PageAnalyticsData, type PageAnalyticsRow } from '../../../lib/metrics-service'
import { HBarChart, BarChart, formatNumber } from '../../../lib/charts'

type SortKey = keyof PageAnalyticsRow
type SortDir = 'asc' | 'desc'

export default function ActivityPage() {
  const { dateRange, geoFilter } = useFilters()
  const [data, setData] = useState<PageAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('pageLoads')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPageAnalytics(dateRange, geoFilter).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange, geoFilter])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading page analytics...</span></div>
  }

  const sortedRoutes = [...data.routes].sort((a, b) => {
    const av = a[sortKey] as number
    const bv = b[sortKey] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Page Analytics & Drop-offs</h1>
        <p className="page-subtitle">Per-route performance, dwell time, bounce rates, and UX insights</p>
      </div>

      {/* Per-Route Analytics Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">Per-Route Analytics</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span><strong>Bounce Rate</strong> = % of visits with no interaction (no click/scroll/input) before leaving</span>
          <span><strong>Drop-off Rate</strong> = % of users who started a multi-step flow on this page but abandoned before completing</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {([
                  ['route', 'Route'],
                  ['pageLoads', 'Page Loads'],
                  ['uniqueUsers', 'Unique Users'],
                  ['avgDwellTime', 'Avg Dwell Time'],
                  ['bounceRate', 'Bounce Rate'],
                  ['dropOffRate', 'Drop-off Rate'],
                  ['errors', 'Errors'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    className={sortKey === key ? 'sorted' : ''}
                    onClick={() => key !== 'route' && toggleSort(key)}
                    style={{ cursor: key === 'route' ? 'default' : 'pointer' }}
                  >
                    {label} {sortKey === key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRoutes.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: 'var(--accent-blue-light)' }}>{r.route}</td>
                  <td>{formatNumber(r.pageLoads)}</td>
                  <td>{formatNumber(r.uniqueUsers)}</td>
                  <td>{r.avgDwellTime}s</td>
                  <td>
                    <span className={`badge ${r.bounceRate > 20 ? 'badge-orange' : 'badge-green'}`}>
                      {r.bounceRate}%
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.dropOffRate > 25 ? 'badge-red' : r.dropOffRate > 15 ? 'badge-orange' : 'badge-green'}`}>
                      {r.dropOffRate}%
                    </span>
                  </td>
                  <td>
                    {r.errors > 0 ? (
                      <span className="badge badge-red">{r.errors}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Drop-off Distribution</div>
          <div className="chart-subtitle">Routes where sessions end — high drop-off = potential UX issue</div>
          <HBarChart
            data={data.dropOffDistribution.map(d => ({ label: d.route, value: d.count }))}
            color="var(--accent-red)"
          />
        </div>
        <div className="card">
          <div className="chart-title">Session Duration Distribution</div>
          <BarChart
            data={data.sessionDurations.map(d => ({ date: d.bucket, value: d.count }))}
            color="var(--chart-6)"
            height={200}
          />
        </div>
      </div>

      {/* Error Hotspots */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">Error Hotspots</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Error Name</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.errorHotspots.map((e, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: 'var(--accent-blue-light)' }}>{e.route}</td>
                  <td>
                    <span className="badge badge-red">{e.errorName}</span>
                  </td>
                  <td>{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="card">
        <div className="chart-title">Funnel Visualization</div>
        <div className="chart-subtitle">Typical user journey: Market → Product → Order</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {[
            { step: '/market', users: 4521, pct: 100 },
            { step: '/booth/:id', users: 2134, pct: 47 },
            { step: '/product/:id', users: 1876, pct: 42 },
            { step: '/order/new', users: 987, pct: 22 },
            { step: 'Completed', users: 641, pct: 14 },
          ].map((s, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                background: `rgba(59, 130, 246, ${0.2 + (s.pct / 100) * 0.6})`,
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px',
                textAlign: 'center',
                minWidth: 100,
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{s.step}</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatNumber(s.users)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue-light)' }}>{s.pct}%</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '1.25rem' }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
