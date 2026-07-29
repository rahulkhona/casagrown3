'use client'

import React, { useEffect, useState } from 'react'
import { fetchStateOfBusiness, type StateOfBusinessData } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { formatNumber, formatCurrency } from '../../../lib/charts'

export function StateOfBusinessView() {
  const { dateRange, geoFilter } = useFilters()
  const [data, setData] = useState<StateOfBusinessData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchStateOfBusiness(dateRange, geoFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [dateRange, geoFilter])

  if (loading || !data) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading State of Business metrics...</span>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header">
        <h1 className="page-title">State of Business</h1>
        <p className="page-subtitle">Real-time marketplace growth, conversion health, and operational metrics</p>
      </div>

      {/* Primary KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">Total Users</span>
          <span className="kpi-value">{formatNumber(data.totalUsers)}</span>
          <span className="kpi-sub">Registered user profiles</span>
        </div>

        <div className="kpi-card orange">
          <span className="kpi-label">Users Unsigned ToS</span>
          <span className="kpi-value">{formatNumber(data.usersUnsignedTos)}</span>
          <span className="kpi-sub">Registered but pending ToS</span>
        </div>

        <div className="kpi-card red" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <span className="kpi-label">Account Abandons</span>
          <span className="kpi-value">{formatNumber(data.accountAbandons)}</span>
          <span className="kpi-sub">Leads without active account</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">Total Leads</span>
          <span className="kpi-value">{formatNumber(data.totalLeads)}</span>
          <span className="kpi-sub">Captured prospects</span>
        </div>
      </div>

      {/* Inventory & Transactions KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card purple">
          <span className="kpi-label">Total Listings</span>
          <span className="kpi-value">{formatNumber(data.totalListings)}</span>
          <span className="kpi-sub">Products in catalog</span>
        </div>

        <div className="kpi-card green">
          <span className="kpi-label">Active Listings</span>
          <span className="kpi-value">{formatNumber(data.activeListings)}</span>
          <span className="kpi-sub">Live & buyable products</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">Total Orders</span>
          <span className="kpi-value">{formatNumber(data.totalOrders)}</span>
          <span className="kpi-sub">All-time order count</span>
        </div>

        <div className="kpi-card orange">
          <span className="kpi-label">Pending Orders</span>
          <span className="kpi-value">{formatNumber(data.pendingOrders)}</span>
          <span className="kpi-sub">Awaiting acceptance/pickup</span>
        </div>
      </div>

      {/* Financial & Performance KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">Gross Merchandise Value (GMV)</span>
          <span className="kpi-value">{formatCurrency(data.gmv)}</span>
          <span className="kpi-sub">Completed order volume</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">Average Order Value (AOV)</span>
          <span className="kpi-value">{formatCurrency(data.avgOrderValue)}</span>
          <span className="kpi-sub">Avg spend per transaction</span>
        </div>

        <div className="kpi-card purple">
          <span className="kpi-label">Sell-Through Rate</span>
          <span className="kpi-value">{data.sellThroughRate}%</span>
          <span className="kpi-sub">% active listings sold</span>
        </div>

        <div className="kpi-card red" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <span className="kpi-label">Dispute & Refund Rate</span>
          <span className="kpi-value">{data.disputeRate}%</span>
          <span className="kpi-sub">Orders disputed or refunded</span>
        </div>
      </div>

      {/* Shares, Clicks & Viral Growth KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">📲 Total Product Shares</span>
          <span className="kpi-value">{formatNumber(data.totalShares)}</span>
          <span className="kpi-sub">Shared listing short links</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">💬 WhatsApp Shares</span>
          <span className="kpi-value">{formatNumber(data.whatsappShares)}</span>
          <span className="kpi-sub">
            {data.totalShares > 0 ? `${((data.whatsappShares / data.totalShares) * 100).toFixed(1)}% of total shares` : 'WhatsApp channel shares'}
          </span>
        </div>

        <div className="kpi-card purple">
          <span className="kpi-label">👆 Share Clicks</span>
          <span className="kpi-value">{formatNumber(data.totalShareClicks)}</span>
          <span className="kpi-sub">Accumulated share link clicks</span>
        </div>

        <div className="kpi-card orange">
          <span className="kpi-label">👥 Referral Invites</span>
          <span className="kpi-value">{formatNumber(data.totalInvites)}</span>
          <span className="kpi-sub">Attributed user invites</span>
        </div>
      </div>

      {/* Produce Interests (Demand & Supply) KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">🛒 Buy Produce Interests</span>
          <span className="kpi-value">{formatNumber(data.buyInterestsCount)}</span>
          <span className="kpi-sub">Buyer demand registrations</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">👩‍🌾 Sell Produce Interests</span>
          <span className="kpi-value">{formatNumber(data.sellInterestsCount)}</span>
          <span className="kpi-sub">Seller supply registrations</span>
        </div>

        <div className="kpi-card purple">
          <span className="kpi-label">🌿 Total Produce Interests</span>
          <span className="kpi-value">{formatNumber(data.buyInterestsCount + data.sellInterestsCount)}</span>
          <span className="kpi-sub">Combined interest intents</span>
        </div>

        <div className="kpi-card orange">
          <span className="kpi-label">⚖️ Demand / Supply Ratio</span>
          <span className="kpi-value">
            {data.sellInterestsCount > 0
              ? `${(data.buyInterestsCount / data.sellInterestsCount).toFixed(2)}x`
              : '1.00x'}
          </span>
          <span className="kpi-sub">Buy vs Sell interest ratio</span>
        </div>
      </div>

      {/* Top Produce Demand & Supply Table */}
      {data.topInterestedProduce && data.topInterestedProduce.length > 0 && (
        <div className="card glass">
          <div className="chart-header" style={{ marginBottom: 16 }}>
            <h2 className="chart-title">🌿 Top Produce Demand & Supply Interests</h2>
            <span className="badge badge-green">Geo-Filtered Intent</span>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Produce Item</th>
                  <th>Buy Demand</th>
                  <th>Sell Supply</th>
                  <th>Total Interest</th>
                  <th>Market Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.topInterestedProduce.map(item => (
                  <tr key={item.produce_name}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.produce_name}</td>
                    <td><span className="badge badge-green">{item.buyCount} Buyers</span></td>
                    <td><span className="badge badge-blue">{item.sellCount} Sellers</span></td>
                    <td><strong>{item.total}</strong></td>
                    <td>
                      {item.buyCount > item.sellCount ? (
                        <span className="badge badge-orange">High Buyer Demand</span>
                      ) : item.sellCount > item.buyCount ? (
                        <span className="badge badge-purple">High Seller Supply</span>
                      ) : (
                        <span className="badge badge-green">Balanced</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Platform Share & Click Performance Table */}
      {data.platformBreakdown && data.platformBreakdown.length > 0 && (
        <div className="card glass">
          <div className="chart-header" style={{ marginBottom: 16 }}>
            <h2 className="chart-title">📲 Share & Click Performance by Platform</h2>
            <span className="badge badge-purple">Attributed Conversion Health</span>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Platform / Channel</th>
                  <th>Shares Sent</th>
                  <th>Clicks Received</th>
                  <th>Click-Through Rate (CTR)</th>
                </tr>
              </thead>
              <tbody>
                {data.platformBreakdown.map(item => (
                  <tr key={item.platform}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.platform}</td>
                    <td><span className="badge badge-green">{formatNumber(item.sharesCount)} Shares</span></td>
                    <td><span className="badge badge-blue">{formatNumber(item.clicksCount)} Clicks</span></td>
                    <td>
                      <strong style={{ color: item.clickThroughRate > 20 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                        {item.clickThroughRate}%
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
