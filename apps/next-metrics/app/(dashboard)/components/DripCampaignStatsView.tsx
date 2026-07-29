'use client'

import React, { useEffect, useState } from 'react'
import { fetchDripCampaignStats, type DripCampaignData } from '../../../lib/portal-service'
import { formatNumber } from '../../../lib/charts'

const SEQUENCES = [
  { id: 'welcome_sequence', name: '👋 Welcome & Onboarding Drip Sequence' },
  { id: 'promo_builder_campaign', name: '📣 Spring Promotion Builder Campaign' },
  { id: 'broadcast_email_sms', name: '📱 Weekly Harvest Email & SMS Broadcast' },
  { id: 'seasonal_garden_sequence', name: '🥑 Seasonal Produce & Garden Reminders' },
  { id: 'cart_recovery_sequence', name: '🛒 Abandoned Cart / Listing Recovery' },
]

export function DripCampaignStatsView() {
  const [selectedSeq, setSelectedSeq] = useState('welcome_sequence')
  const [data, setData] = useState<DripCampaignData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchDripCampaignStats(selectedSeq).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [selectedSeq])

  if (loading || !data) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading drip sequence & campaign performance analytics...</span>
      </div>
    )
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Drip Campaign Stats</h1>
          <p className="page-subtitle">Sequence enrollments, email/SMS sends, bounces, unsubscribes, step drill-down, and weekday engagement grid</p>
        </div>

        {/* Sequence Selector */}
        <select
          value={selectedSeq}
          onChange={e => setSelectedSeq(e.target.value)}
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            fontWeight: 600,
            minWidth: 320,
          }}
        >
          {SEQUENCES.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Overview */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">ENROLLED USERS</div>
          <div className="kpi-value">{formatNumber(data.enrolledUsers)}</div>
          <div className="kpi-sub">Active enrolled profiles</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">EMAILS SENT</div>
          <div className="kpi-value" style={{ color: 'var(--chart-1)' }}>{formatNumber(data.emailsSent)}</div>
          <div className="kpi-sub">Bounced: {data.emailsBounced} | Unsub: {data.emailsUnsubscribed}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">SMS SENT</div>
          <div className="kpi-value" style={{ color: 'var(--chart-2)' }}>{formatNumber(data.smsSent)}</div>
          <div className="kpi-sub">Bounced: {data.smsBounced} | Unsub: {data.smsUnsubscribed}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">EMAIL / SMS CLICK RATES</div>
          <div className="kpi-value" style={{ fontSize: '1.4rem' }}>
            {data.emailClickRatePct}% / {data.smsClickRatePct}%
          </div>
          <div className="kpi-sub">Sent step click-through rates</div>
        </div>
      </div>

      {/* Steps Table */}
      <div className="card glass">
        <div className="chart-title" style={{ marginBottom: 16 }}>Sequence Step Breakdown</div>
        <div className="table-scroll">
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Step Name</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Channel</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sent</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Opened</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Clicked</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.steps.map(st => (
                <tr key={st.nodeId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{st.stepName}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${st.channel === 'email' ? 'badge-blue' : 'badge-green'}`}>
                      {st.channel.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{formatNumber(st.sentCount)}</td>
                  <td style={{ padding: '12px 16px' }}>{formatNumber(st.openedCount)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-green)' }}>{formatNumber(st.clickedCount)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{st.clickRatePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekday-Hour Heatmap Grid */}
      <div className="card">
        <div className="chart-title">Weekday & Hour Send & Engagement Activity Grid</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Peak delivery and user engagement hours (00:00 to 23:00) across Sunday – Saturday
        </p>

        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '8px', color: 'var(--text-muted)', textAlign: 'left' }}>HOUR / DAY</th>
                {days.map(d => (
                  <th key={d} style={{ padding: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>{d.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }).map((_, hour) => {
                const hourLabel = `${hour.toString().padStart(2, '0')}:00`
                return (
                  <tr key={hour} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>{hourLabel}</td>
                    {days.map((_, day) => {
                      const item = data.weekdayCalendarGrid.find(g => g.dayOfWeek === day && g.hourOfDay === hour)
                      const count = item?.count || 0
                      const alpha = count === 0 ? 0.05 : Math.min(count / 20, 1)

                      return (
                        <td key={day} style={{ padding: '4px', textAlign: 'center' }}>
                          <div style={{
                            padding: '6px 0',
                            borderRadius: 'var(--radius-sm)',
                            background: count === 0 ? 'rgba(255, 255, 255, 0.02)' : `rgba(16, 185, 129, ${alpha})`,
                            color: count > 0 ? '#fff' : 'var(--text-muted)',
                            fontWeight: count > 10 ? 700 : 400,
                          }}>
                            {count > 0 ? count : '-'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
