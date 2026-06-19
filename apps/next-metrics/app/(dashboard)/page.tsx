'use client'

import { useEffect, useState } from 'react'
import { useFilters } from './layout'
import { fetchUserGrowth, fetchSalesSummary, fetchMarketplaceHealth } from '../../lib/metrics-service'
import { Sparkline, formatNumber, formatCurrency } from '../../lib/charts'
import { supabase } from '../../lib/supabase'

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
      const fourteenDaysAgo = new Date()
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

      const [users, sales, health, dbUsers, dbLeads, dbProducts] = await Promise.all([
        fetchUserGrowth(dateRange, granularity, geoFilter),
        fetchSalesSummary(dateRange, granularity, geoFilter),
        fetchMarketplaceHealth(dateRange),
        supabase.from('profiles').select('created_at').gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('crm_leads').select('created_at').gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('market_products').select('created_at').eq('is_active', true).eq('is_deleted', false).gte('created_at', fourteenDaysAgo.toISOString())
      ])

      if (cancelled) return

      const getWoWStats = (rows: any[] | null) => {
        if (!rows || rows.length === 0) return { count: 0, change: 0 }
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        
        const currentWeekRows = rows.filter(r => new Date(r.created_at) >= sevenDaysAgo)
        const prevWeekRows = rows.filter(r => new Date(r.created_at) < sevenDaysAgo)

        const currentCount = currentWeekRows.length
        const prevCount = prevWeekRows.length
        let change = 0
        if (prevCount > 0) {
          change = Math.round(((currentCount - prevCount) / prevCount) * 100 * 10) / 10
        } else if (currentCount > 0) {
          change = 100
        }
        return { count: currentCount, change }
      }

      const getTimeSeries14Days = (rows: any[] | null) => {
        const series = new Array(14).fill(0)
        if (!rows) return series
        const now = new Date()
        for (let i = 0; i < 14; i++) {
          const d = new Date()
          d.setDate(now.getDate() - (13 - i))
          const dateStr = d.toISOString().split('T')[0]
          series[i] = rows.filter(r => r.created_at && r.created_at.startsWith(dateStr)).length
        }
        return series
      }

      const userWoW = getWoWStats(dbUsers.data)
      const leadWoW = getWoWStats(dbLeads.data)
      const productWoW = getWoWStats(dbProducts.data)

      setKpis([
        {
          label: 'User Growth (WoW)',
          value: `+${formatNumber(userWoW.count)} new`,
          change: userWoW.change,
          sparkData: getTimeSeries14Days(dbUsers.data),
          accent: 'blue',
        },
        {
          label: 'Lead Growth (WoW)',
          value: `+${formatNumber(leadWoW.count)} new`,
          change: leadWoW.change,
          sparkData: getTimeSeries14Days(dbLeads.data),
          accent: 'blue',
        },
        {
          label: 'Active Listings (WoW)',
          value: `+${formatNumber(productWoW.count)} active`,
          change: productWoW.change,
          sparkData: getTimeSeries14Days(dbProducts.data),
          accent: 'purple',
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
