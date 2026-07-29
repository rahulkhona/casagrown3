'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { HBarChart, DonutChart, formatNumber } from '../../../../lib/charts'

interface AttributionData {
  total_signups: number
  by_source: { label: string; value: number; color: string }[]
  top_referrers: { name: string; email: string; count: number }[]
  by_utm_source: { label: string; value: number }[]
  by_utm_campaign: { label: string; value: number }[]
  avg_touches: number
  recent_signups: { email: string; source: string; referrer_name: string | null; created_at: string }[]
}

const SOURCE_COLORS: Record<string, string> = {
  invite: '#16a34a',
  organic: '#6366f1',
  facebook: '#1877f2',
  google: '#ea4335',
  google_organic: '#fbbc05',
  nextdoor: '#8ed500',
  instagram: '#e1306c',
  twitter: '#1da1f2',
  other: '#6b7280',
}

export default function AttributionPage() {
  const [data, setData] = useState<AttributionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // 1. Signups by source (last-touch)
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, signup_source, signup_referrer_id, first_touch_source, created_at')
          .not('signup_source', 'is', null)
          .order('created_at', { ascending: false })

        if (profilesError) throw profilesError

        const allProfiles = profiles || []
        const total_signups = allProfiles.length

        // Group by source
        const sourceCounts: Record<string, number> = {}
        allProfiles.forEach(p => {
          const source = p.signup_source || 'organic'
          sourceCounts[source] = (sourceCounts[source] || 0) + 1
        })

        const by_source = Object.entries(sourceCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({
            label,
            value,
            color: SOURCE_COLORS[label] || SOURCE_COLORS.other!,
          }))

        // 2. Top referrers
        const referrerIds = allProfiles
          .filter(p => p.signup_referrer_id)
          .map(p => p.signup_referrer_id!)

        const referrerCounts: Record<string, number> = {}
        referrerIds.forEach(id => {
          referrerCounts[id] = (referrerCounts[id] || 0) + 1
        })

        let top_referrers: AttributionData['top_referrers'] = []
        const topReferrerIds = Object.entries(referrerCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id]) => id)

        if (topReferrerIds.length > 0) {
          const { data: referrerProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', topReferrerIds)

          top_referrers = topReferrerIds.map(id => {
            const profile = referrerProfiles?.find(p => p.id === id)
            return {
              name: profile?.full_name || 'Unknown',
              email: profile?.email || '',
              count: referrerCounts[id]!,
            }
          })
        }

        // 3. UTM source breakdown
        const utmSourceCounts: Record<string, number> = {}
        const utmCampaignCounts: Record<string, number> = {}

        // Get UTM data from profiles
        const { data: utmProfiles } = await supabase
          .from('profiles')
          .select('utm_source, utm_campaign')
          .not('utm_source', 'is', null)

        ;(utmProfiles || []).forEach(p => {
          if (p.utm_source) utmSourceCounts[p.utm_source] = (utmSourceCounts[p.utm_source] || 0) + 1
          if (p.utm_campaign) utmCampaignCounts[p.utm_campaign] = (utmCampaignCounts[p.utm_campaign] || 0) + 1
        })

        const by_utm_source = Object.entries(utmSourceCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value }))

        const by_utm_campaign = Object.entries(utmCampaignCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value }))

        // 4. Average touches before signup
        const { data: touchCounts } = await supabase
          .from('referral_touches')
          .select('user_id')

        const touchesByUser: Record<string, number> = {}
        ;(touchCounts || []).forEach(t => {
          touchesByUser[t.user_id] = (touchesByUser[t.user_id] || 0) + 1
        })

        const touchValues = Object.values(touchesByUser)
        const avg_touches = touchValues.length > 0
          ? touchValues.reduce((s, v) => s + v, 0) / touchValues.length
          : 0

        // 5. Recent signups with attribution
        const recentProfiles = allProfiles.slice(0, 20)
        const recentReferrerIds = recentProfiles
          .filter(p => p.signup_referrer_id)
          .map(p => p.signup_referrer_id!)

        let referrerNames: Record<string, string> = {}
        if (recentReferrerIds.length > 0) {
          const { data: refProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', recentReferrerIds)
          ;(refProfiles || []).forEach(p => {
            referrerNames[p.id] = p.full_name || 'Unknown'
          })
        }

        const recent_signups = recentProfiles.map(p => ({
          email: p.email || '',
          source: p.signup_source || 'organic',
          referrer_name: p.signup_referrer_id ? (referrerNames[p.signup_referrer_id] || 'Unknown') : null,
          created_at: p.created_at || '',
        }))

        setData({
          total_signups,
          by_source,
          top_referrers,
          by_utm_source,
          by_utm_campaign,
          avg_touches,
          recent_signups,
        })
      } catch (err) {
        console.error('Failed to fetch attribution data:', err)
        // Show placeholder data
        setData({
          total_signups: 0,
          by_source: [],
          top_referrers: [],
          by_utm_source: [],
          by_utm_campaign: [],
          avg_touches: 0,
          recent_signups: [],
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading attribution data...</span></div>
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">🎯 Attribution & Referral Tracking</h1>
        <p className="page-subtitle">First-touch and last-touch attribution for user signups</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card green">
          <span className="kpi-label">Total Attributed Signups</span>
          <span className="kpi-value">{formatNumber(data.total_signups)}</span>
        </div>
        <div className="kpi-card blue">
          <span className="kpi-label">Avg Touches Before Signup</span>
          <span className="kpi-value">{data.avg_touches.toFixed(1)}</span>
        </div>
        <div className="kpi-card purple">
          <span className="kpi-label">Referral Signups</span>
          <span className="kpi-value">{formatNumber(data.by_source.find(s => s.label === 'invite')?.value || 0)}</span>
        </div>
        <div className="kpi-card orange">
          <span className="kpi-label">Organic Signups</span>
          <span className="kpi-value">{formatNumber(data.by_source.find(s => s.label === 'organic')?.value || 0)}</span>
        </div>
      </div>

      {/* Source Breakdown + UTM Source */}
      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Signups by Source (Last-Touch)</div>
          {data.by_source.length > 0 ? (
            <DonutChart data={data.by_source} />
          ) : (
            <div className="empty-state"><span>No data yet — signups with attribution will appear here</span></div>
          )}
        </div>
        <div className="card">
          <div className="chart-title">UTM Source Breakdown</div>
          {data.by_utm_source.length > 0 ? (
            <HBarChart data={data.by_utm_source} color="var(--chart-3)" />
          ) : (
            <div className="empty-state"><span>No UTM data — add ?utm_source= to ad links</span></div>
          )}
        </div>
      </div>

      {/* Top Referrers */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">🏆 Top Referrers — Who's Driving Signups?</div>
        {data.top_referrers.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Signups Driven</th>
                </tr>
              </thead>
              <tbody>
                {data.top_referrers.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: i < 3 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.email}</td>
                    <td style={{ fontWeight: 700 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><span>No referral signups yet</span></div>
        )}
      </div>

      {/* UTM Campaign performance */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="chart-title">📊 Campaign Performance (UTM)</div>
        {data.by_utm_campaign.length > 0 ? (
          <HBarChart data={data.by_utm_campaign} color="var(--chart-5)" />
        ) : (
          <div className="empty-state"><span>No campaign data — add ?utm_campaign= to ad links</span></div>
        )}
      </div>

      {/* Recent Signups Table */}
      <div className="card">
        <div className="chart-title">Recent Signups with Attribution</div>
        {data.recent_signups.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Source</th>
                  <th>Referred By</th>
                  <th>Signed Up</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_signups.map((s, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.email}</td>
                    <td>
                      <span style={{
                        background: SOURCE_COLORS[s.source] || SOURCE_COLORS.other,
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        {s.source}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.referrer_name || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><span>No attributed signups yet</span></div>
        )}
      </div>
    </div>
  )
}
