'use client'

import React, { useEffect, useState } from 'react'
import { fetchTrafficTrends, type TrafficTrendsData } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { BarChart, formatNumber, generateDateRange } from '../../../lib/charts'

export function TrafficTrendsView() {
  const { utmFilter } = useFilters()
  const today = new Date().toISOString().split('T')[0]!
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0]!
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]!
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]!

  const [dateRange, setLocalRange] = useState({ start: thirtyDaysAgo, end: today })
  const [data, setData] = useState<TrafficTrendsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRoute, setSelectedRoute] = useState('all')

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchTrafficTrends(dateRange, utmFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [dateRange, utmFilter])

  if (loading || !data) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading traffic trend histograms (filtering bots)...</span>
      </div>
    )
  }

  // Filter raw visits by selected route if specific route is picked
  const filteredVisits = selectedRoute === 'all'
    ? data.rawVisits
    : data.rawVisits.filter(v => v.route === selectedRoute)

  // Group into time buckets for BarChart histograms
  const timeBuckets: Record<string, { visits: number; sessions: Set<string> }> = {}
  filteredVisits.forEach(v => {
    const bucket = v.date || dateRange.start
    if (!timeBuckets[bucket]) {
      timeBuckets[bucket] = { visits: 0, sessions: new Set() }
    }
    timeBuckets[bucket]!.visits += 1
    timeBuckets[bucket]!.sessions.add(v.sessionId)
  })

  const sortedDates = Object.keys(timeBuckets).sort()
  const visitsBarData = sortedDates.map(d => ({
    date: d,
    value: timeBuckets[d]!.visits,
  }))
  const sessionsBarData = sortedDates.map(d => ({
    date: d,
    value: timeBuckets[d]!.sessions.size,
  }))

  const filteredTotalVisits = filteredVisits.length
  const filteredUniqueSessions = new Set(filteredVisits.map(v => v.sessionId)).size

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">Traffic Trends</h1>
            <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>⏱️ 60-Day Retention Bound</span>
          </div>
          <p className="page-subtitle">Histogram trend analytics for non-bot traffic pageviews and unique sessions per route over time</p>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '0.8125rem', color: '#10b981', fontWeight: 600 }}>
          ✓ Bot Traffic Excluded (is_bot = false)
        </div>
      </div>

      {/* 1. ROUTE SELECTOR & DATE CONTROLS */}
      <div className="card glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255, 255, 255, 0.05)', padding: 4, borderRadius: 'var(--radius-sm)' }}>
            {[
              { label: '7D', val: sevenDaysAgo },
              { label: '14D', val: fourteenDaysAgo },
              { label: '30D', val: thirtyDaysAgo },
              { label: '60D (Max)', val: sixtyDaysAgo },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => setLocalRange({ start: p.val, end: today })}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: dateRange.start === p.val ? 'var(--chart-1)' : 'transparent',
                  color: dateRange.start === p.val ? '#000' : 'var(--text-main)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            min={sixtyDaysAgo}
            max={today}
            value={dateRange.start}
            onChange={e => setLocalRange({ ...dateRange, start: e.target.value })}
            style={{
              padding: '6px 10px',
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
            min={sixtyDaysAgo}
            max={today}
            value={dateRange.end}
            onChange={e => setLocalRange({ ...dateRange, end: e.target.value })}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
            }}
          />

          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 8 }}>
            🛣️ SELECT ROUTE:
          </label>
          <select
            value={selectedRoute}
            onChange={e => setSelectedRoute(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: selectedRoute !== 'all' ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
              background: selectedRoute !== 'all' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card)',
              color: selectedRoute !== 'all' ? 'var(--accent-green)' : 'var(--text-main)',
              fontWeight: selectedRoute !== 'all' ? 600 : 400,
              fontSize: '0.9rem',
              minWidth: 220,
            }}
          >
            <option value="all">All Routes Aggregate ({data.availableRoutes.length})</option>
            {data.availableRoutes.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {selectedRoute !== 'all' && (
          <button
            onClick={() => setSelectedRoute('all')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--accent-red)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Reset Route Filter ✕
          </button>
        )}
      </div>

      {/* 2. KPI OVERVIEW CARDS (BELOW ROUTE SELECTOR) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        <div className="kpi-card" style={{ padding: 24 }}>
          <div className="kpi-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em' }}>TOTAL PAGEVIEWS ({selectedRoute === 'all' ? 'ALL ROUTES' : selectedRoute})</div>
          <div className="kpi-value" style={{ fontSize: '2.5rem', margin: '8px 0' }}>{formatNumber(filteredTotalVisits)}</div>
          <div className="kpi-sub">Non-bot pageviews for selected route selection</div>
        </div>

        <div className="kpi-card" style={{ padding: 24 }}>
          <div className="kpi-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em' }}>UNIQUE SESSIONS ({selectedRoute === 'all' ? 'ALL ROUTES' : selectedRoute})</div>
          <div className="kpi-value" style={{ fontSize: '2.5rem', margin: '8px 0', color: 'var(--accent-green)' }}>{formatNumber(filteredUniqueSessions)}</div>
          <div className="kpi-sub">Unique visitor sessions for selected route selection</div>
        </div>
      </div>

      {/* 3. DEDICATED BARCHART HISTOGRAMS OVER TIME */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 20 }}>
        {/* Pageviews Histogram */}
        <div className="card glass">
          <div className="chart-header">
            <h2 className="chart-title">Route Pageviews Trend Histogram</h2>
            <span className="badge badge-blue">BarChart Histogram</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <BarChart data={visitsBarData} color="var(--chart-2)" height={220} formatValue={formatNumber} />
          </div>
        </div>

        {/* Unique Sessions Histogram */}
        <div className="card glass">
          <div className="chart-header">
            <h2 className="chart-title">Unique Sessions Trend Histogram</h2>
            <span className="badge badge-green">BarChart Histogram</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <BarChart data={sessionsBarData} color="var(--accent-green)" height={220} formatValue={formatNumber} />
          </div>
        </div>
      </div>

      {/* 4. ROUTE ANALYTICS BREAKDOWN TABLE */}
      <div className="card glass">
        <div className="chart-title" style={{ marginBottom: 16 }}>Route Level Analytics Breakdown</div>
        <div className="table-scroll">
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Route Slug</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Visits</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Unique Sessions</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Avg Dwell Time (s)</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Bounce Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.routes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    No non-bot traffic records for the selected filters.
                  </td>
                </tr>
              ) : (
                data.routes.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>
                      <span className="code" style={{ cursor: 'pointer' }} onClick={() => setSelectedRoute(r.route)}>{r.route}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{formatNumber(r.totalVisits)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--accent-green)', fontWeight: 600 }}>{formatNumber(r.uniqueSessions)}</td>
                    <td style={{ padding: '12px 16px' }}>{r.avgDwellSecs}s</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${r.bounceRate > 50 ? 'badge-red' : 'badge-green'}`}>{r.bounceRate}%</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
