'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
)

type Send = {
  id: string
  sequence_id: string
  node_id: string | null
  recipient_type: string
  recipient_id: string
  email: string | null
  phone: string | null
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  unsubscribed_at: string | null
  error: string | null
}

type HourlyBucket = {
  hour: string
  channel: 'email' | 'sms'
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  errors: number
}

export default function SequenceMonitorPage() {
  const params = useParams()
  const router = useRouter()
  const sequenceId = params.id as string

  const [seqName, setSeqName] = useState('')
  const [seqDef, setSeqDef] = useState<any>(null)
  const [sends, setSends] = useState<Send[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [globalStats, setGlobalStats] = useState<{ totalSent: number; totalUnsubscribed: number } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [seqRes, sendsRes, enrollRes] = await Promise.all([
      supabase.from('crm_sequences').select('name, definition, status').eq('id', sequenceId).single(),
      supabase.from('crm_campaign_sends').select('*').eq('sequence_id', sequenceId).order('sent_at', { ascending: false, nullsFirst: false }).limit(5000),
      supabase.from('crm_sequence_enrollments').select('id, status, recipient_id, recipient_type, current_node_id').eq('sequence_id', sequenceId),
    ])
    if (seqRes.data) {
      setSeqName(seqRes.data.name)
      setSeqDef(seqRes.data.definition)
    }
    if (sendsRes.data) setSends(sendsRes.data)
    if (enrollRes.data) setEnrollments(enrollRes.data)
    setLastRefresh(new Date())
    setLoading(false)
  }, [sequenceId])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const { count: totalSentCount } = await supabase
          .from('crm_campaign_sends')
          .select('*', { count: 'exact', head: true })
          .is('error', null)
          .not('sent_at', 'is', null)

        const { count: totalUnsubCount } = await supabase
          .from('crm_campaign_sends')
          .select('*', { count: 'exact', head: true })
          .not('unsubscribed_at', 'is', null)

        setGlobalStats({
          totalSent: totalSentCount || 0,
          totalUnsubscribed: totalUnsubCount || 0,
        })
      } catch (err) {
        console.error('Failed to fetch global stats:', err)
      }
    }
    fetchGlobalStats()
  }, [])

  // Calculate expected sends from sequence definition
  const getExpected = () => {
    if (!seqDef || !enrollments.length) return { expectedEmails: 0, expectedSms: 0 }
    const nodes = seqDef.nodes || []
    const emailNodes = nodes.filter((n: any) => (n.data?.type || n.type) === 'action_email').length
    const smsNodes = nodes.filter((n: any) => (n.data?.type || n.type) === 'action_sms').length
    const totalEnrolled = enrollments.length
    return {
      expectedEmails: emailNodes * totalEnrolled,
      expectedSms: smsNodes * totalEnrolled,
    }
  }

  // Aggregate stats
  const totalSent = sends.filter(s => s.sent_at && !s.error).length
  const totalDelivered = sends.filter(s => s.delivered_at).length
  const totalOpened = sends.filter(s => s.opened_at).length
  const totalClicked = sends.filter(s => s.clicked_at).length
  const totalBounced = sends.filter(s => s.bounced_at).length
  const totalUnsubscribed = sends.filter(s => s.unsubscribed_at).length
  const totalErrors = sends.filter(s => s.error).length
  const totalEmailSends = sends.filter(s => s.email && s.sent_at && !s.error).length
  const totalSmsSends = sends.filter(s => s.phone && !s.email && s.sent_at && !s.error).length

  const unsubscribedSends = sends.filter(s => s.unsubscribed_at)
  
  // Calculate average steps before opt-out
  let avgStepsBeforeOptOut = 0
  if (unsubscribedSends.length > 0) {
    const stepsPerRecipient = unsubscribedSends.map(u => {
      const recipientSends = sends.filter(s => s.recipient_id === u.recipient_id && s.sent_at)
      return recipientSends.length
    })
    const totalSteps = stepsPerRecipient.reduce((sum, val) => sum + val, 0)
    avgStepsBeforeOptOut = totalSteps / unsubscribedSends.length
  }

  // Calculate average days active before opt-out
  let avgDaysBeforeOptOut = 0
  if (unsubscribedSends.length > 0) {
    const daysPerRecipient = unsubscribedSends.map(u => {
      const recipientSends = sends.filter(s => s.recipient_id === u.recipient_id && s.sent_at)
      if (recipientSends.length === 0) return 0
      const sentTimes = recipientSends.map(s => new Date(s.sent_at!).getTime())
      const firstSent = Math.min(...sentTimes)
      const unsubTime = new Date(u.unsubscribed_at!).getTime()
      const diffMs = unsubTime - firstSent
      return Math.max(0, diffMs / (1000 * 60 * 60 * 24))
    })
    const totalDays = daysPerRecipient.reduce((sum, val) => sum + val, 0)
    avgDaysBeforeOptOut = totalDays / unsubscribedSends.length
  }

  // Global opt-out average
  const globalOptOutPct = globalStats && globalStats.totalSent > 0
    ? (globalStats.totalUnsubscribed / globalStats.totalSent) * 100
    : null

  const { expectedEmails, expectedSms } = getExpected()
  const enrollActive = enrollments.filter(e => e.status === 'active').length
  const enrollCompleted = enrollments.filter(e => e.status === 'completed').length

  const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : '—'

  // Hourly buckets grouped by hour and channel
  const hourlyMap = new Map<string, HourlyBucket>()
  for (const s of sends) {
    const ts = s.sent_at || s.bounced_at || s.unsubscribed_at
    if (!ts) continue
    const hour = new Date(ts).toISOString().slice(0, 13) + ':00'
    const channel = s.email ? 'email' : 'sms'
    const key = `${hour}_${channel}`
    
    let bucket = hourlyMap.get(key)
    if (!bucket) {
      bucket = { hour, channel, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, errors: 0 }
      hourlyMap.set(key, bucket)
    }
    if (s.sent_at && !s.error) bucket.sent++
    if (s.delivered_at) bucket.delivered++
    if (s.opened_at) bucket.opened++
    if (s.clicked_at) bucket.clicked++
    if (s.bounced_at) bucket.bounced++
    if (s.unsubscribed_at) bucket.unsubscribed++
    if (s.error) bucket.errors++
  }
  const hourlyBuckets = Array.from(hourlyMap.values()).sort((a, b) => {
    const timeCompare = b.hour.localeCompare(a.hour)
    if (timeCompare !== 0) return timeCompare
    return a.channel.localeCompare(b.channel)
  })

  // Export raw log
  const exportCSV = () => {
    const headers = ['Recipient ID', 'Type', 'Email', 'Phone', 'Node', 'Sent At', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Unsubscribed At', 'Error']
    const rows = sends.map(s => [
      s.recipient_id, s.recipient_type, s.email || '', s.phone || '', s.node_id || '',
      s.sent_at || '', s.delivered_at || '', s.opened_at || '', s.clicked_at || '', s.bounced_at || '', s.unsubscribed_at || '', s.error || ''
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `sequence_monitor_${seqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  const cardStyle = (bg: string, border: string): React.CSSProperties => ({
    flex: 1, padding: '16px', background: bg, border: `1px solid ${border}`, borderRadius: 8, textAlign: 'center', minWidth: 120
  })

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <Link href="/crm/sequences" style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.85rem' }}>← Sequences</Link>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1a2e1a' }}>📊 {seqName || 'Sequence Monitor'}</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
            Last refreshed: {lastRefresh.toLocaleTimeString()} • Auto-refreshes every 60s
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData} disabled={loading} style={{
            padding: '8px 16px', background: '#1a2e1a', color: 'white', border: 'none', borderRadius: 6,
            fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontSize: '0.85rem'
          }}>
            {loading ? 'Loading...' : '🔄 Refresh'}
          </button>
          <button onClick={exportCSV} style={{
            padding: '8px 16px', background: '#e0e7ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: 6,
            fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem'
          }}>
            📥 Export Raw Log CSV
          </button>
        </div>
      </div>

      {/* Delivery Health */}
      <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#854d0e' }}>🎯 Delivery Health</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #fde68a' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: '#854d0e' }}>Channel</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#854d0e' }}>Sent</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#854d0e' }}>Delivered</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#854d0e' }}>Delivery %</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#854d0e' }}>Opt-Out</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#854d0e' }}>Bounced</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#854d0e' }}>Errors</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 0', fontWeight: 600 }}>📧 Email</td>
                  <td style={{ textAlign: 'center', padding: '6px 8px' }}>{totalEmailSends}</td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700, color: '#2563eb' }}>
                    {sends.filter(s => s.email && s.delivered_at).length}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: totalEmailSends > 0 && sends.filter(s => s.email && s.delivered_at).length / totalEmailSends < 0.8 ? '#dc2626' : '#16a34a' }}>
                    {pct(sends.filter(s => s.email && s.delivered_at).length, totalEmailSends)}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', color: sends.filter(s => s.email && s.unsubscribed_at).length > 0 ? '#dc2626' : '#9ca3af' }}>
                    {sends.filter(s => s.email && s.unsubscribed_at).length}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', color: sends.filter(s => s.email && s.bounced_at).length > 0 ? '#dc2626' : '#9ca3af' }}>
                    {sends.filter(s => s.email && s.bounced_at).length}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', color: sends.filter(s => s.email && s.error).length > 0 ? '#dc2626' : '#9ca3af' }}>
                    {sends.filter(s => s.email && s.error).length}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', fontWeight: 600 }}>💬 SMS</td>
                  <td style={{ textAlign: 'center', padding: '6px 8px' }}>{totalSmsSends}</td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700, color: '#2563eb' }}>
                    {sends.filter(s => s.phone && !s.email && s.delivered_at).length}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: totalSmsSends > 0 && sends.filter(s => s.phone && !s.email && s.delivered_at).length / totalSmsSends < 0.8 ? '#dc2626' : '#16a34a' }}>
                    {pct(sends.filter(s => s.phone && !s.email && s.delivered_at).length, totalSmsSends)}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', color: sends.filter(s => s.phone && !s.email && s.unsubscribed_at).length > 0 ? '#dc2626' : '#9ca3af' }}>
                    {sends.filter(s => s.phone && !s.email && s.unsubscribed_at).length}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', color: sends.filter(s => s.phone && !s.email && s.bounced_at).length > 0 ? '#dc2626' : '#9ca3af' }}>
                    {sends.filter(s => s.phone && !s.email && s.bounced_at).length}
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 8px', color: sends.filter(s => s.phone && !s.email && s.error).length > 0 ? '#dc2626' : '#9ca3af' }}>
                    {sends.filter(s => s.phone && !s.email && s.error).length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '0.85rem', color: '#854d0e' }}>
              <div style={{ marginBottom: 6 }}>Enrollments: <strong>{enrollments.length}</strong> total</div>
              <div style={{ marginBottom: 6 }}>Active: <strong style={{ color: '#2563eb' }}>{enrollActive}</strong> • Completed: <strong style={{ color: '#16a34a' }}>{enrollCompleted}</strong></div>
              <div>Errors: <strong style={{ color: totalErrors > 0 ? '#dc2626' : '#16a34a' }}>{totalErrors}</strong></div>
              {totalErrors > 0 && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.8rem' }}>
                  {Array.from(new Set(sends.filter(s => s.error).map(s => s.error))).map((err, i) => (
                    <div key={i} style={{ color: '#dc2626' }}>⚠️ {err} ({sends.filter(s => s.error === err).length}x)</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={cardStyle('#f0fdf4', '#bbf7d0')}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#166534', marginBottom: 4, textTransform: 'uppercase' }}>Sent</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>{totalSent}</div>
        </div>
        <div style={cardStyle('#eff6ff', '#bfdbfe')}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#1e40af', marginBottom: 4, textTransform: 'uppercase' }}>Delivered</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{totalDelivered}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{pct(totalDelivered, totalSent)}</div>
        </div>
        <div style={cardStyle('#faf5ff', '#e9d5ff')}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b21a8', marginBottom: 4, textTransform: 'uppercase' }}>Opened</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed' }}>{totalOpened}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{pct(totalOpened, totalDelivered)}</div>
        </div>
        <div style={cardStyle('#fff7ed', '#fed7aa')}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9a3412', marginBottom: 4, textTransform: 'uppercase' }}>Clicked</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ea580c' }}>{totalClicked}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{pct(totalClicked, totalOpened)}</div>
        </div>
        <div style={{
          ...cardStyle('#fff1f2', '#fecdd3'),
          minWidth: 200,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9f1239', marginBottom: 4, textTransform: 'uppercase' }}>Opt-Out</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e11d48' }}>
            {totalUnsubscribed}
            <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 500, marginLeft: 6 }}>
              ({pct(totalUnsubscribed, totalSent)})
            </span>
          </div>
          {globalOptOutPct !== null && (
            <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: 2, fontWeight: 500 }}>
              vs. Global Avg: {globalOptOutPct.toFixed(2)}%
            </div>
          )}
          {totalUnsubscribed > 0 && (
            <div style={{ borderTop: '1px solid #fda4af', width: '100%', marginTop: 8, paddingTop: 4, fontSize: '0.65rem', color: '#4c0519', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div>• Avg. active: <strong>{avgDaysBeforeOptOut.toFixed(1)} days</strong></div>
              <div>• Avg. steps: <strong>{avgStepsBeforeOptOut.toFixed(1)} messages</strong></div>
            </div>
          )}
        </div>
        <div style={cardStyle('#fef2f2', '#fca5a5')}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#991b1b', marginBottom: 4, textTransform: 'uppercase' }}>Bounced</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{totalBounced}</div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{pct(totalBounced, totalSent)}</div>
        </div>
        <div style={cardStyle('#fef2f2', '#fca5a5')}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#991b1b', marginBottom: 4, textTransform: 'uppercase' }}>Errors</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{totalErrors}</div>
        </div>
      </div>

      {/* Hourly Metrics */}
      <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>📈 Hourly Breakdown</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Hour</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Channel</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#15803d' }}>Sent</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#2563eb' }}>Delivered</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#7c3aed' }}>Opened</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#ea580c' }}>Clicked</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#e11d48' }}>Opt-Out</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#dc2626' }}>Bounced</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#dc2626' }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {hourlyBuckets.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>No sends yet</td></tr>
              ) : hourlyBuckets.map(b => (
                <tr key={`${b.hour}_${b.channel}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500 }}>
                    {new Date(b.hour).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC
                    <span style={{ color: '#9ca3af', fontSize: '0.75rem', marginLeft: 6 }}>
                      ({new Date(b.hour).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} PT)
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: '#4b5563' }}>
                    {b.channel === 'email' ? '📧 Email' : '💬 SMS'}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#15803d' }}>{b.sent}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', color: '#2563eb' }}>{b.delivered}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', color: '#7c3aed' }}>{b.opened}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', color: '#ea580c' }}>{b.clicked}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', color: b.unsubscribed > 0 ? '#e11d48' : '#9ca3af' }}>{b.unsubscribed}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', color: b.bounced > 0 ? '#dc2626' : '#9ca3af' }}>{b.bounced}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center', color: b.errors > 0 ? '#dc2626' : '#9ca3af' }}>{b.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw Log */}
      <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>📋 Raw Send Log ({sends.length} records)</h3>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Recipient</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Node</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Sent</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Delivered</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Opened</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Clicked</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Bounced</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Opt-Out</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {sends.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>No sends yet</td></tr>
              ) : sends.slice(0, 500).map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', background: s.error ? '#fef2f2' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{s.email || s.phone || s.recipient_id.slice(0, 8)}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.75rem' }}>{s.node_id || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                    {s.sent_at ? `✅ ${new Date(s.sent_at).toLocaleTimeString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                    {s.delivered_at ? `✅ ${new Date(s.delivered_at).toLocaleTimeString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                    {s.opened_at ? `👁️ ${new Date(s.opened_at).toLocaleTimeString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                    {s.clicked_at ? `🔗 ${new Date(s.clicked_at).toLocaleTimeString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                    {s.bounced_at ? `❌ ${new Date(s.bounced_at).toLocaleTimeString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                    {s.unsubscribed_at ? `🛑 ${new Date(s.unsubscribed_at).toLocaleTimeString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#dc2626', fontSize: '0.75rem' }}>{s.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
