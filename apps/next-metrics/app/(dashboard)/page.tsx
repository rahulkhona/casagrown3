'use client'

import { useEffect, useState } from 'react'
import { useFilters } from './layout'
import { fetchUserGrowth, fetchSalesSummary, fetchMarketplaceHealth, fetchWeeklyTrends, type WeeklyTrendPoint } from '../../lib/metrics-service'
import { Sparkline, BarChart, DonutChart, HBarChart, formatNumber, formatCurrency } from '../../lib/charts'
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
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyTrendPoint[]>([])
  const [sharingStats, setSharingStats] = useState<{
    sharesWoW: { count: number; change: number; sparkData: number[] }
    clicksWoW: { count: number; change: number; sparkData: number[] }
    signupsWoW: { count: number; change: number; sparkData: number[] }
    salesWoW: { count: number; amount: number; change: number; sparkData: number[] }
    platformShares: { label: string; value: number; color: string }[]
    platformClicks: { label: string; value: number; color: string }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const fourteenDaysAgo = new Date()
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

      const [
        users, sales, health, 
        dbUsers, dbLeads, dbProducts, dbShares, 
        dbProductShares, dbShareSignups, dbShareOrders,
        weeklyData
      ] = await Promise.all([
        fetchUserGrowth(dateRange, granularity, geoFilter),
        fetchSalesSummary(dateRange, granularity, geoFilter),
        fetchMarketplaceHealth(dateRange),
        supabase.from('profiles').select('created_at').gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('crm_leads').select('created_at').gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('market_products').select('created_at').eq('is_active', true).eq('is_deleted', false).gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('growbot_shared_responses').select('created_at').gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('crm_short_links').select('created_at, click_count, label').or('label.ilike.product_share:%,label.ilike.new_product_share:%').eq('is_shared', true).gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('profiles').select('created_at, utm_source').in('utm_campaign', ['product_share', 'new_product_share']).gte('created_at', fourteenDaysAgo.toISOString()),
        supabase.from('market_orders').select('id, total_usd, created_at, profiles!buyer_id!inner(utm_campaign, utm_source)').in('profiles.utm_campaign', ['product_share', 'new_product_share']).gte('created_at', fourteenDaysAgo.toISOString()),
        fetchWeeklyTrends(8)
      ])

      if (cancelled) return

      setWeeklyTrends(weeklyData)

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

      const getWoWClickStats = (rows: any[] | null) => {
        if (!rows || rows.length === 0) return { count: 0, change: 0 }
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        
        const currentWeekRows = rows.filter(r => new Date(r.created_at) >= sevenDaysAgo)
        const prevWeekRows = rows.filter(r => new Date(r.created_at) < sevenDaysAgo)

        const currentCount = currentWeekRows.reduce((s, r) => s + (r.click_count || 0), 0)
        const prevCount = prevWeekRows.reduce((s, r) => s + (r.click_count || 0), 0)
        let change = 0
        if (prevCount > 0) {
          change = Math.round(((currentCount - prevCount) / prevCount) * 100 * 10) / 10
        } else if (currentCount > 0) {
          change = 100
        }
        return { count: currentCount, change }
      }

      const getWoWSalesStats = (rows: any[] | null) => {
        if (!rows || rows.length === 0) return { count: 0, amount: 0, change: 0 }
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        
        const currentWeekRows = rows.filter(r => new Date(r.created_at) >= sevenDaysAgo)
        const prevWeekRows = rows.filter(r => new Date(r.created_at) < sevenDaysAgo)

        const currentCount = currentWeekRows.length
        const prevCount = prevWeekRows.length
        const currentAmount = currentWeekRows.reduce((s, r) => s + parseFloat(r.total_usd || 0), 0)
        const prevAmount = prevWeekRows.reduce((s, r) => s + parseFloat(r.total_usd || 0), 0)
        let change = 0
        if (prevAmount > 0) {
          change = Math.round(((currentAmount - prevAmount) / prevAmount) * 100 * 10) / 10
        } else if (currentAmount > 0) {
          change = 100
        }
        return { count: currentCount, amount: currentAmount, change }
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

      const getClickTimeSeries14Days = (rows: any[] | null) => {
        const series = new Array(14).fill(0)
        if (!rows) return series
        const now = new Date()
        for (let i = 0; i < 14; i++) {
          const d = new Date()
          d.setDate(now.getDate() - (13 - i))
          const dateStr = d.toISOString().split('T')[0]
          series[i] = rows
            .filter(r => r.created_at && r.created_at.startsWith(dateStr))
            .reduce((s, r) => s + (r.click_count || 0), 0)
        }
        return series
      }

      const getSalesTimeSeries14Days = (rows: any[] | null) => {
        const series = new Array(14).fill(0)
        if (!rows) return series
        const now = new Date()
        for (let i = 0; i < 14; i++) {
          const d = new Date()
          d.setDate(now.getDate() - (13 - i))
          const dateStr = d.toISOString().split('T')[0]
          series[i] = rows
            .filter(r => r.created_at && r.created_at.startsWith(dateStr))
            .reduce((s, r) => s + parseFloat(r.total_usd || 0), 0)
        }
        return series
      }

      const getPlatformBreakdown = (rows: any[] | null, metricType: 'shares' | 'clicks') => {
        const platformCounts: Record<string, number> = {}
        if (!rows) return []
        rows.forEach(r => {
          const parts = (r.label || '').split(':')
          const platform = (parts[1] || 'other').toLowerCase()
          const value = metricType === 'clicks' ? (r.click_count || 0) : 1
          if (value > 0) {
            platformCounts[platform] = (platformCounts[platform] || 0) + value
          }
        })
        const colors: Record<string, string> = {
          whatsapp: '#25d366',
          facebook: '#1877f2',
          sms: '#10b981',
          email: '#6366f1',
          copy: '#4b5563',
          nextdoor: '#8ed500',
          native: '#10b981',
          other: '#9ca3af',
        }
        return Object.entries(platformCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            value,
            color: colors[label] || colors.other,
          }))
      }

      const userWoW = getWoWStats(dbUsers.data)
      const leadWoW = getWoWStats(dbLeads.data)
      const productWoW = getWoWStats(dbProducts.data)
      const shareWoW = getWoWStats(dbShares.data)

      const sharesWoW = getWoWStats(dbProductShares.data)
      const clicksWoW = getWoWClickStats(dbProductShares.data)
      const signupsWoW = getWoWStats(dbShareSignups.data)
      const salesWoW = getWoWSalesStats(dbShareOrders.data)

      setSharingStats({
        sharesWoW: { count: sharesWoW.count, change: sharesWoW.change, sparkData: getTimeSeries14Days(dbProductShares.data) },
        clicksWoW: { count: clicksWoW.count, change: clicksWoW.change, sparkData: getClickTimeSeries14Days(dbProductShares.data) },
        signupsWoW: { count: signupsWoW.count, change: signupsWoW.change, sparkData: getTimeSeries14Days(dbShareSignups.data) },
        salesWoW: { count: salesWoW.count, amount: salesWoW.amount, change: salesWoW.change, sparkData: getSalesTimeSeries14Days(dbShareOrders.data) },
        platformShares: getPlatformBreakdown(dbProductShares.data, 'shares'),
        platformClicks: getPlatformBreakdown(dbProductShares.data, 'clicks'),
      })

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
          label: 'GrowBot Shares (WoW)',
          value: `+${formatNumber(shareWoW.count)} shared`,
          change: shareWoW.change,
          sparkData: getTimeSeries14Days(dbShares.data),
          accent: 'orange',
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
      } catch (err: any) {
        if (cancelled) return
        console.error(err)
        setError(err.message || 'Failed to load metrics')
        setLoading(false)
      }
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
      ) : error ? (
        <div className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)', padding: 32, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', textAlign: 'center', margin: '24px 0' }}>
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>Access Denied or Database Error</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 450 }}>
            {error.includes("Mock data is disabled") 
              ? "Your account does not have staff permissions to view live database metrics. Please log out and sign in with an authorized staff account (e.g. admin@casagrown.com)." 
              : error}
          </p>
        </div>
      ) : (
        <>
          {/* Weekly Trends Section */}
          {weeklyTrends.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Live Week-over-Week Trends
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Real-time metrics queried directly from database tables (past 8 weeks)
                  </p>
                </div>
              </div>
              <div className="chart-grid-4">
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chart-title" style={{ margin: 0 }}>User Signups WoW</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Live</span>
                  </div>
                  <BarChart
                    data={weeklyTrends.map(t => ({ date: t.weekLabel, value: t.signups }))}
                    color="var(--chart-1)"
                    height={160}
                  />
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chart-title" style={{ margin: 0 }}>New Listings WoW</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Live</span>
                  </div>
                  <BarChart
                    data={weeklyTrends.map(t => ({ date: t.weekLabel, value: t.listings }))}
                    color="var(--chart-3)"
                    height={160}
                  />
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chart-title" style={{ margin: 0 }}>CRM Leads WoW</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Live</span>
                  </div>
                  <BarChart
                    data={weeklyTrends.map(t => ({ date: t.weekLabel, value: t.leads }))}
                    color="var(--chart-2)"
                    height={160}
                  />
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chart-title" style={{ margin: 0 }}>GrowBot Shares WoW</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Live</span>
                  </div>
                  <BarChart
                    data={weeklyTrends.map(t => ({ date: t.weekLabel, value: t.shares }))}
                    color="#f97316"
                    height={160}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Listing Share & Conversion Performance Section */}
          {sharingStats && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Listing Share & Conversion Performance
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Real-time product sharing activity and attributed referral signups & purchases
                </p>
              </div>

              {/* KPI Grid */}
              <div className="kpi-grid stagger" style={{ marginBottom: 24 }}>
                <div className="kpi-card blue">
                  <span className="kpi-label">Product Shares (WoW)</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <span className="kpi-value">+{formatNumber(sharingStats.sharesWoW.count)} shared</span>
                    <Sparkline
                      data={sharingStats.sharesWoW.sparkData}
                      color="var(--accent-blue)"
                      width={80}
                      height={28}
                    />
                  </div>
                  <span className={`kpi-change ${sharingStats.sharesWoW.change >= 0 ? 'up' : 'down'}`}>
                    {sharingStats.sharesWoW.change >= 0 ? '↑' : '↓'} {Math.abs(sharingStats.sharesWoW.change)}%
                  </span>
                </div>

                <div className="kpi-card green">
                  <span className="kpi-label">Product Clicks (WoW)</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <span className="kpi-value">+{formatNumber(sharingStats.clicksWoW.count)} clicks</span>
                    <Sparkline
                      data={sharingStats.clicksWoW.sparkData}
                      color="var(--accent-green)"
                      width={80}
                      height={28}
                    />
                  </div>
                  <span className={`kpi-change ${sharingStats.clicksWoW.change >= 0 ? 'up' : 'down'}`}>
                    {sharingStats.clicksWoW.change >= 0 ? '↑' : '↓'} {Math.abs(sharingStats.clicksWoW.change)}%
                  </span>
                </div>

                <div className="kpi-card purple">
                  <span className="kpi-label">Attributed Signups (WoW)</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <span className="kpi-value">+{formatNumber(sharingStats.signupsWoW.count)} signups</span>
                    <Sparkline
                      data={sharingStats.signupsWoW.sparkData}
                      color="var(--accent-purple)"
                      width={80}
                      height={28}
                    />
                  </div>
                  <span className={`kpi-change ${sharingStats.signupsWoW.change >= 0 ? 'up' : 'down'}`}>
                    {sharingStats.signupsWoW.change >= 0 ? '↑' : '↓'} {Math.abs(sharingStats.signupsWoW.change)}%
                  </span>
                </div>

                <div className="kpi-card orange">
                  <span className="kpi-label">Attributed Sales (WoW)</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <span className="kpi-value">+{formatCurrency(sharingStats.salesWoW.amount)}</span>
                    <Sparkline
                      data={sharingStats.salesWoW.sparkData}
                      color="var(--accent-orange)"
                      width={80}
                      height={28}
                    />
                  </div>
                  <span className={`kpi-change ${sharingStats.salesWoW.change >= 0 ? 'up' : 'down'}`}>
                    {sharingStats.salesWoW.change >= 0 ? '↑' : '↓'} {Math.abs(sharingStats.salesWoW.change)}%
                  </span>
                </div>
              </div>

              {/* Breakdown Charts Grid */}
              <div className="chart-grid-2">
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="chart-title">Outbound Shares by Platform</div>
                  {sharingStats.platformShares.length > 0 ? (
                    <DonutChart data={sharingStats.platformShares} />
                  ) : (
                    <div className="empty-state"><span>No sharing data in this period</span></div>
                  )}
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="chart-title">Inbound Clicks by Platform</div>
                  {sharingStats.platformClicks.length > 0 ? (
                    <HBarChart data={sharingStats.platformClicks} color="var(--chart-2)" />
                  ) : (
                    <div className="empty-state"><span>No click data in this period</span></div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Performance Overview
            </h2>
          </div>
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
        </>
      )}
    </div>
  )
}

