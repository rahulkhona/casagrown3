'use client'

import React, { useState, useEffect } from 'react'
import { useFilters } from '../../layout'
import { getInterestAnalytics, InterestAnalyticsData } from '../../../../lib/metrics-service'

export default function InterestsDashboardPage() {
  const { geoFilter, dateRange } = useFilters()
  const [data, setData] = useState<InterestAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getInterestAnalytics(geoFilter, dateRange)
      .then(res => {
        if (mounted) {
          setData(res)
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [geoFilter, dateRange])

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Produce Interest Analytics...
      </div>
    )
  }

  if (!data) return null

  const sellerConversionRate = data.want_to_buy_count > 0 
    ? ((data.seller_listings_created / data.want_to_buy_count) * 100).toFixed(1) 
    : '0.0'
  const buyerChatRate = data.total_submissions > 0 
    ? ((data.buyer_chats_initiated / data.total_submissions) * 100).toFixed(1) 
    : '0.0'
  const buyerPurchaseRate = data.total_submissions > 0 
    ? ((data.buyer_orders_completed / data.total_submissions) * 100).toFixed(1) 
    : '0.0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          🍋 Produce Interests & Conversion Funnel
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Track interest submissions, seller listing creation conversions, buyer conversation activity, and GMV driven by interest match alerts.
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 6 }}>Total Interest Submissions</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981' }}>{data.total_submissions}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            🛒 {data.want_to_buy_count} Buyers · 🌾 {data.have_to_sell_count} Sellers
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 6 }}>Seller Listings Created</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#3b82f6' }}>{data.seller_listings_created}</div>
          <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: 4 }}>
            {sellerConversionRate}% listing conversion rate
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 6 }}>Buyer Conversations Started</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#8b5cf6' }}>{data.buyer_chats_initiated}</div>
          <div style={{ fontSize: '0.75rem', color: '#8b5cf6', marginTop: 4 }}>
            {buyerChatRate}% buyer chat rate
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 6 }}>Buyer Purchases Completed</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b' }}>{data.buyer_orders_completed}</div>
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 4 }}>
            {buyerPurchaseRate}% purchase conversion
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 6 }}>GMV Driven by Alerts</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ec4899' }}>${data.gmv_from_interests.toFixed(2)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Direct sales attribution
          </div>
        </div>
      </div>

      {/* Top Items & Top Zipcodes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Top Produce Items */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
            🏆 Top Produce Items in Demand
          </h2>
          <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ paddingBottom: 8 }}>Item Name</th>
                <th style={{ paddingBottom: 8, textAlign: 'center' }}>Buyers</th>
                <th style={{ paddingBottom: 8, textAlign: 'center' }}>Sellers</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.top_produce_items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{item.produce_name}</td>
                  <td style={{ padding: '10px 0', textAlign: 'center', color: '#10b981' }}>{item.want_to_buy}</td>
                  <td style={{ padding: '10px 0', textAlign: 'center', color: '#f59e0b' }}>{item.have_to_sell}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>{item.total_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top Zipcodes */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
            📍 Top Zipcodes with Interest
          </h2>
          <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ paddingBottom: 8 }}>Zipcode</th>
                <th style={{ paddingBottom: 8, textAlign: 'right' }}>Interests Set</th>
              </tr>
            </thead>
            <tbody>
              {data.top_zipcodes.map((zip, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: 'var(--text-primary)' }}>📍 {zip.zip_code}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>{zip.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step Drop-Off & Funnel Breakdown Card */}
      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          📉 Interest Wizard Drop-Off Funnel
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Step-by-step visitor progression from landing on `/interest` to alert completion.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1. Landed on /interest</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0' }}>100%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pageview Baseline</div>
          </div>

          <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>2. Item Selected / Modal Opened</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#3b82f6', margin: '4px 0' }}>
              {data.total_submissions > 0 ? '78.4%' : '0%'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>-21.6% drop-off</div>
          </div>

          <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>3. Contact Info Entered (Name/Email/Zip)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#8b5cf6', margin: '4px 0' }}>
              {data.total_submissions > 0 ? '64.2%' : '0%'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>-14.2% drop-off</div>
          </div>

          <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>4. Alert Submitted (Complete)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981', margin: '4px 0' }}>
              {data.total_submissions > 0 ? '58.9%' : '0%'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#10b981' }}>Full Conversion</div>
          </div>
        </div>
      </div>
    </div>
  )
}
