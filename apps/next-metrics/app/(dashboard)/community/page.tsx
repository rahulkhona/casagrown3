'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../layout'
import { fetchCommunityChatMetrics, type CommunityChatData } from '../../../lib/metrics-service'
import { BarChart, LineChart, formatNumber } from '../../../lib/charts'

export default function CommunityChatPage() {
  const { dateRange, granularity, geoFilter } = useFilters()
  const [data, setData] = useState<CommunityChatData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCommunityChatMetrics(dateRange, granularity, geoFilter).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange, granularity, geoFilter])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading community chat metrics...</span></div>
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Community Chat</h1>
        <p className="page-subtitle">Track engagement and user growth across neighborhood groups</p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card blue">
          <span className="kpi-label">Average Daily Active Users</span>
          <span className="kpi-value">{formatNumber(data.avgDailyActiveUsers)}</span>
        </div>
        <div className="kpi-card green">
          <span className="kpi-label">Total Messages Sent</span>
          <span className="kpi-value">{formatNumber(data.totalMessages)}</span>
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Daily Active Users (DAU)</div>
          <BarChart data={data.dailyActiveUsers} color="var(--chart-1)" height={280} />
        </div>
        <div className="card">
          <div className="chart-title">Cumulative Chat Users Growth</div>
          <LineChart data={data.userGrowth} color="var(--chart-2)" height={280} />
        </div>
      </div>
    </div>
  )
}
