'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../layout'
import { fetchMarketplaceHealth, type MarketplaceHealthData } from '../../../lib/metrics-service'
import { LineChart, BarChart, DonutChart, formatNumber } from '../../../lib/charts'

export default function HealthPage() {
  const { dateRange } = useFilters()
  const [data, setData] = useState<MarketplaceHealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMarketplaceHealth(dateRange).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading marketplace data...</span></div>
  }

  const latestSellers = data.activeSellers[data.activeSellers.length - 1]?.value || 0
  const latestBuyers = data.activeBuyers[data.activeBuyers.length - 1]?.value || 0
  const totalBooths = data.newBooths.reduce((s, p) => s + p.value, 0)

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Marketplace Health</h1>
        <p className="page-subtitle">Active participants, product listings, and content moderation</p>
      </div>

      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">Active Sellers</span>
          <span className="kpi-value">{formatNumber(latestSellers)}</span>
        </div>
        <div className="kpi-card blue">
          <span className="kpi-label">Active Buyers</span>
          <span className="kpi-value">{formatNumber(latestBuyers)}</span>
        </div>
        <div className="kpi-card purple">
          <span className="kpi-label">New Booths</span>
          <span className="kpi-value">{formatNumber(totalBooths)}</span>
        </div>
        <div className="kpi-card orange">
          <span className="kpi-label">Avg Seller Rating</span>
          <span className="kpi-value">{data.avgSellerRating.toFixed(1)} ★</span>
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Active Sellers Trend</div>
          <LineChart data={data.activeSellers} color="var(--chart-2)" height={200} />
        </div>
        <div className="card">
          <div className="chart-title">Active Buyers Trend</div>
          <LineChart data={data.activeBuyers} color="var(--chart-1)" height={200} />
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Product Listings</div>
          <DonutChart
            data={[
              { label: 'Active', value: data.productListings.active, color: 'var(--accent-green)' },
              { label: 'Inactive', value: data.productListings.inactive, color: 'var(--accent-red)' },
            ]}
            size={140}
          />
        </div>
        <div className="card">
          <div className="chart-title">Flag Activity</div>
          <div className="chart-subtitle">Flagged products & comments over time</div>
          <BarChart data={data.flagActivity} color="var(--accent-orange)" height={200} />
        </div>
      </div>

      <div className="card">
        <div className="chart-title">New Booths Created</div>
        <BarChart data={data.newBooths} color="var(--chart-4)" height={180} />
      </div>
    </div>
  )
}
