'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../layout'
import { fetchPageAnalytics, fetchPlatformUsage, generateUtmAnalyticsQuery, fetchWizardDropoffs, fetchActiveWizards, type PageAnalyticsData, type PageAnalyticsRow, type PlatformUsageData, type CrmFunnelRow } from '../../../lib/metrics-service'
import { HBarChart, BarChart, LineChart, DonutChart, formatNumber } from '../../../lib/charts'

type SortKey = keyof PageAnalyticsRow
type SortDir = 'asc' | 'desc'

export default function ActivityPage() {
  const { dateRange, geoFilter, utmFilter } = useFilters()
  const [data, setData] = useState<PageAnalyticsData | null>(null)
  const [platformData, setPlatformData] = useState<PlatformUsageData | null>(null)
  const [wizardFunnels, setWizardFunnels] = useState<Record<string, CrmFunnelRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('pageLoads')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [chatPrompt, setChatPrompt] = useState('')
  const [chatHistory, setChatHistory] = useState<{ role: string, content: string, data?: any, chartType?: string }[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchPageAnalytics(dateRange, geoFilter, utmFilter),
      fetchPlatformUsage(dateRange),
      fetchActiveWizards(dateRange),
    ]).then(async ([pageData, platData, activeWizards]) => {
      if (cancelled) return
      // Fetch funnels for all active wizards
      const funnels: Record<string, CrmFunnelRow[]> = {}
      await Promise.all(activeWizards.map(async (wizardSlug) => {
        const funnel = await fetchWizardDropoffs(dateRange, wizardSlug, geoFilter)
        funnels[wizardSlug] = funnel
      }))
      if (!cancelled) {
        setData(pageData)
        setPlatformData(platData)
        setWizardFunnels(funnels)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [dateRange, geoFilter, utmFilter])

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!chatPrompt.trim() || isChatLoading) return
    const newHistory = [...chatHistory, { role: 'user', content: chatPrompt }]
    setChatHistory(newHistory)
    setChatPrompt('')
    setIsChatLoading(true)
    try {
      const res = await generateUtmAnalyticsQuery(chatPrompt, newHistory.slice(-5))
      if (res.valid) {
        setChatHistory([...newHistory, { role: 'assistant', content: res.explanation, data: res.data, chartType: res.chartType }])
      } else {
        setChatHistory([...newHistory, { role: 'assistant', content: `Error: ${res.error}` }])
      }
    } catch (err: any) {
      setChatHistory([...newHistory, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setIsChatLoading(false)
    }
  }

  function renderChatChart(item: any) {
    if (!item.data || !Array.isArray(item.data) || item.data.length === 0) return null;
    const keys = Object.keys(item.data[0])
    // Map generic SQL columns to chart formats. Assume first string column is label/date, first numeric column is value.
    const stringKey = keys.find(k => typeof item.data[0][k] === 'string') || keys[0]
    const numKey = keys.find(k => typeof item.data[0][k] === 'number') || keys[1] || keys[0]
    
    const chartData = item.data.map((d: any, i: number) => ({
      date: d[stringKey] || `Item ${i}`,
      label: d[stringKey] || `Item ${i}`,
      value: Number(d[numKey]) || 0,
      color: `hsl(${(i * 137.508) % 360}, 70%, 50%)` // Generate distinct colors for DonutChart
    }))

    if (item.chartType === 'LineChart') return <LineChart data={chartData} color="var(--accent-blue)" />
    if (item.chartType === 'BarChart') return <BarChart data={chartData} color="var(--accent-green)" height={200} />
    if (item.chartType === 'HBarChart') return <HBarChart data={chartData} color="var(--accent-orange)" />
    if (item.chartType === 'DonutChart') return <DonutChart data={chartData} />
    // Fallback to table
    return (
      <div className="table-container" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>{keys.map(k => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {item.data.map((row: any, i: number) => (
              <tr key={i}>{keys.map(k => <td key={k}>{row[k]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24, alignItems: 'start' }}>
      <div>

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

      {/* Platform Usage: PWA vs Browser by OS */}
      {platformData && platformData.platformUsage.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="chart-title">📱 Platform Usage — PWA vs Browser by OS</div>
          <div className="chart-subtitle">How users access CasaGrown: installed PWA vs browser, broken down by operating system</div>
          <div className="chart-grid-2" style={{ gap: 24 }}>
            <div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>OS</th>
                      <th>PWA Users</th>
                      <th>Browser Users</th>
                      <th>PWA Sessions</th>
                      <th>Browser Sessions</th>
                      <th>PWA %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformData.platformUsage.map((row, i) => {
                      const totalUsers = row.pwa_users + row.browser_users
                      const pwaPct = totalUsers > 0 ? Math.round((row.pwa_users / totalUsers) * 100) : 0
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{row.os}</td>
                          <td>{formatNumber(row.pwa_users)}</td>
                          <td>{formatNumber(row.browser_users)}</td>
                          <td>{formatNumber(row.pwa_sessions)}</td>
                          <td>{formatNumber(row.browser_sessions)}</td>
                          <td>
                            <span className={`badge ${pwaPct >= 50 ? 'badge-green' : 'badge-orange'}`}>
                              {pwaPct}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <HBarChart
                data={platformData.platformUsage.map(row => ({
                  label: row.os,
                  value: row.pwa_users,
                }))}
                color="var(--accent-green)"
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                PWA users by OS
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Wizard Drop-offs */}
      <div className="chart-grid-2" style={{ marginBottom: 24 }}>
        {Object.entries(wizardFunnels).map(([wizardSlug, funnel], index) => (
          <div key={wizardSlug} className="card">
            <div className="chart-title">{wizardSlug} Wizard Drop-offs</div>
            <div className="chart-subtitle">User funnel through the {wizardSlug} flow</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {funnel.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 120, fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{s.stage}</div>
                  <div style={{ flex: 1, height: 24, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${s.pct_of_top}%`, height: '100%', background: index % 2 === 0 ? 'var(--accent-blue)' : 'var(--accent-green)', opacity: 0.6 + (s.pct_of_top/100)*0.4 }} />
                  </div>
                  <div style={{ width: 80, textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }}>{formatNumber(s.count)}</div>
                  <div style={{ width: 50, textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.pct_of_top}%</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>
      </div>
    </div>
  )
}
