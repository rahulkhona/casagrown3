'use client'

import { useEffect, useState } from 'react'
import { useFilters } from './layout'
import { fetchUserGrowth, fetchSalesSummary, fetchMarketplaceHealth } from '../../lib/metrics-service'
import { Sparkline, formatNumber, formatCurrency } from '../../lib/charts'

interface KPI {
  label: string
  value: string
  change: number
  sparkData: number[]
  accent: string
}

export default function OverviewPage() {
  const { dateRange, granularity, geoFilter } = useFilters()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [users, sales, health] = await Promise.all([
        fetchUserGrowth(dateRange, granularity, geoFilter),
        fetchSalesSummary(dateRange, granularity, geoFilter),
        fetchMarketplaceHealth(dateRange),
      ])

      if (cancelled) return

      setKpis([
        {
          label: 'Total Users',
          value: formatNumber(users.total),
          change: 12.3,
          sparkData: users.timeSeries.slice(-14).map(p => p.value),
          accent: 'blue',
        },
        {
          label: 'New Users',
          value: formatNumber(users.newInPeriod),
          change: 8.7,
          sparkData: users.timeSeries.slice(-14).map(p => p.value),
          accent: 'blue',
        },
        {
          label: 'Total Sales (GMV)',
          value: formatCurrency(sales.totalGMV),
          change: 15.2,
          sparkData: sales.gmvTimeSeries.slice(-14).map(p => p.value),
          accent: 'green',
        },
        {
          label: 'Orders',
          value: formatNumber(sales.totalOrders),
          change: 6.1,
          sparkData: sales.orderCountTimeSeries.slice(-14).map(p => p.value),
          accent: 'green',
        },
        {
          label: 'Avg Order Value',
          value: formatCurrency(sales.avgOrderValue),
          change: 3.4,
          sparkData: sales.gmvTimeSeries.slice(-14).map((p, i) => {
            const orders = sales.orderCountTimeSeries[sales.orderCountTimeSeries.length - 14 + i]?.value || 1
            return Math.round(p.value / orders)
          }),
          accent: 'orange',
        },
        {
          label: 'Active Sellers',
          value: formatNumber(health.activeSellers[health.activeSellers.length - 1]?.value || 0),
          change: 4.5,
          sparkData: health.activeSellers.slice(-14).map(p => p.value),
          accent: 'purple',
        },
        {
          label: 'Active Buyers',
          value: formatNumber(health.activeBuyers[health.activeBuyers.length - 1]?.value || 0),
          change: 9.8,
          sparkData: health.activeBuyers.slice(-14).map(p => p.value),
          accent: 'purple',
        },
        {
          label: 'Platform Fees',
          value: formatCurrency(sales.totalFees),
          change: 14.1,
          sparkData: sales.gmvTimeSeries.slice(-14).map(p => Math.round(p.value * 0.029)),
          accent: 'orange',
        },
      ])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [dateRange, granularity, geoFilter])

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Overview Dashboard</h1>
        <p className="page-subtitle">Key performance indicators at a glance</p>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
          <span>Loading metrics...</span>
        </div>
      ) : (
        <div className="kpi-grid stagger">
          {kpis.map((kpi, i) => (
            <div key={i} className={`kpi-card ${kpi.accent}`}>
              <span className="kpi-label">{kpi.label}</span>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <span className="kpi-value">{kpi.value}</span>
                <Sparkline
                  data={kpi.sparkData}
                  color={`var(--accent-${kpi.accent})`}
                  width={80}
                  height={28}
                />
              </div>
              <span className={`kpi-change ${kpi.change >= 0 ? 'up' : 'down'}`}>
                {kpi.change >= 0 ? '↑' : '↓'} {Math.abs(kpi.change)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
