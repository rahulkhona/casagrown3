'use client'

import React, { useEffect, useState } from 'react'
import { fetchBusinessTrends, type BusinessTrendsData } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { BarChart, formatNumber, formatCurrency } from '../../../lib/charts'

export function TrendsView() {
  const { dateRange, granularity, geoFilter } = useFilters()
  const [data, setData] = useState<BusinessTrendsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchBusinessTrends(dateRange, granularity, geoFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [dateRange, granularity, geoFilter])

  if (loading || !data) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading business trend histograms...</span>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div className="page-header">
        <h1 className="page-title">Business Trends</h1>
        <p className="page-subtitle">Histograms for all State of Business metrics</p>
      </div>

      {/* Group 1: User & Lead Acquisition Trends */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>
          👤 User & Lead Acquisition Trends
        </h2>
        <div className="chart-grid-2" style={{ gap: 20 }}>
          <div className="card">
            <div className="chart-title">User Signups Trend</div>
            <BarChart
              data={data.userTrend.map(d => ({ date: d.date, value: d.signups }))}
              color="var(--chart-1)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">Unconverted Leads Trend</div>
            <BarChart
              data={data.userTrend.map(d => ({ date: d.date, value: d.abandons }))}
              color="var(--accent-red)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">Users Unsigned ToS Trend</div>
            <BarChart
              data={data.userTrend.map(d => ({ date: d.date, value: d.unsignedTos }))}
              color="var(--accent-orange)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">CRM Leads Captured Trend</div>
            <BarChart
              data={data.userTrend.map(d => ({ date: d.date, value: d.leads }))}
              color="var(--chart-5)"
              height={220}
              formatValue={formatNumber}
            />
          </div>
        </div>
      </div>

      {/* Group 2: Marketplace Catalog & Inventory Trends */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>
          🏪 Marketplace Catalog & Inventory Trends
        </h2>
        <div className="chart-grid-2" style={{ gap: 20 }}>
          <div className="card">
            <div className="chart-title">Active Listings Trend</div>
            <BarChart
              data={data.listingTrend.map(d => ({ date: d.date, value: d.active }))}
              color="var(--chart-2)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">Total Listings Catalog Trend</div>
            <BarChart
              data={data.listingTrend.map(d => ({ date: d.date, value: d.total }))}
              color="var(--chart-4)"
              height={220}
              formatValue={formatNumber}
            />
          </div>
        </div>
      </div>

      {/* Group 3: Orders & Revenue Trends */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>
          💰 Orders & Marketplace Performance Trends
        </h2>
        <div className="chart-grid-2" style={{ gap: 20 }}>
          <div className="card">
            <div className="chart-title">Gross Merchandise Value (GMV) Revenue ($)</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Total dollar volume of orders placed on the marketplace
            </p>
            <BarChart
              data={data.orderTrend.map(d => ({ date: d.date, value: d.gmv }))}
              color="var(--chart-3)"
              height={220}
              formatValue={formatCurrency}
            />
          </div>

          <div className="card">
            <div className="chart-title">Total Marketplace Orders Volume (#)</div>
            <BarChart
              data={data.orderTrend.map(d => ({ date: d.date, value: d.totalOrders }))}
              color="var(--chart-1)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">Pending Orders Trend (#)</div>
            <BarChart
              data={data.orderTrend.map(d => ({ date: d.date, value: d.pendingOrders }))}
              color="var(--accent-orange)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">Average Order Value (AOV $)</div>
            <BarChart
              data={data.orderTrend.map(d => ({ date: d.date, value: d.aov }))}
              color="var(--chart-2)"
              height={220}
              formatValue={formatCurrency}
            />
          </div>

          <div className="card">
            <div className="chart-title">Dispute / Refund Rate (%)</div>
            <BarChart
              data={data.orderTrend.map(d => ({ date: d.date, value: d.disputeRate }))}
              color="var(--accent-red)"
              height={220}
              formatValue={v => `${v}%`}
            />
          </div>
        </div>
      </div>

      {/* Group 4: Produce Interest & Demand Trends (Geo-Filtered) */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>
          🌱 User Produce Interest & Demand Trends (Geo-Filtered)
        </h2>
        <div className="chart-grid-2" style={{ gap: 20 }}>
          <div className="card">
            <div className="chart-title">🛒 Buy Produce Interests Trend</div>
            <BarChart
              data={(data.interestTrend || []).map(d => ({ date: d.date, value: d.buyInterests }))}
              color="var(--chart-1)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">👩‍🌾 Sell Produce Interests Trend</div>
            <BarChart
              data={(data.interestTrend || []).map(d => ({ date: d.date, value: d.sellInterests }))}
              color="var(--chart-2)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">🌿 Total Produce Interest Intent Trend</div>
            <BarChart
              data={(data.interestTrend || []).map(d => ({ date: d.date, value: d.totalInterests }))}
              color="var(--chart-5)"
              height={220}
              formatValue={formatNumber}
            />
          </div>
        </div>
      </div>

      {/* Group 5: Product Shares, Clicks & Referral Invites Trends */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-muted)' }}>
          📲 Product Listing Shares, Clicks & Referral Invites Trends
        </h2>
        <div className="chart-grid-2" style={{ gap: 20 }}>
          <div className="card">
            <div className="chart-title">📲 Total Product Shares Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.totalShares }))}
              color="var(--chart-1)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">💬 WhatsApp Shares Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.whatsappShares }))}
              color="var(--chart-2)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">🏡 Nextdoor Shares Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.nextdoorShares }))}
              color="var(--chart-3)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">📘 Facebook & IG Shares Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.facebookShares }))}
              color="var(--chart-4)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">📱 SMS & Copy Shares Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.smsShares + d.copyShares }))}
              color="var(--chart-1)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">👆 Share Link Clicks Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.shareClicks }))}
              color="var(--chart-5)"
              height={220}
              formatValue={formatNumber}
            />
          </div>

          <div className="card">
            <div className="chart-title">👥 Referral Invites Trend</div>
            <BarChart
              data={(data.shareTrend || []).map(d => ({ date: d.date, value: d.totalInvites }))}
              color="var(--accent-orange)"
              height={220}
              formatValue={formatNumber}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
