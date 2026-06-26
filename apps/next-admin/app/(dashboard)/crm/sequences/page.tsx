'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adminApi } from '../../../../lib/adminApi'

type Sequence = {
  id: string
  name: string
  status: 'draft' | 'active' | 'archived'
  trigger_event: string | null
  created_at: string
  test_emails?: string[]
  test_phones?: string[]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<any>(null)
  const [selectedSequenceName, setSelectedSequenceName] = useState('')
  const [showDryRunModal, setShowDryRunModal] = useState(false)
  const router = useRouter()

  const toast = (msg: string, ms = 5000) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(prev => prev === msg ? '' : prev), ms)
  }

  const [globalStats, setGlobalStats] = useState<{ totalSent: number; totalUnsubscribed: number } | null>(null)

  useEffect(() => {
    const fetchSequences = async () => {
      setLoading(true)
      const { data } = await adminApi.select('crm_sequences', '*', undefined, { order: { column: 'created_at', ascending: false } })
      if (data) setSequences(data)
      setLoading(false)
    }
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
    fetchSequences()
    fetchGlobalStats()
  }, [])

  const handleCreate = async () => {
    try {
      setIsCreating(true)
      setErrorMsg('')
      const { data, error } = await adminApi.insert('crm_sequences', {
          name: `New Sequence ${new Date().toLocaleDateString()}`,
          status: 'draft',
          definition: { nodes: [], edges: [], startNodeId: null }
        })

      if (error) throw new Error(error)
      if (!data || data.length === 0) throw new Error('No data returned from insert')

      router.push(`/crm/sequences/${data[0].id}`)
    } catch (e: any) {
      setErrorMsg(`Failed to create sequence: ${e.message}`)
      setIsCreating(false)
    }
  }

  const deleteSequence = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sequence?')) return
    const { error } = await adminApi.delete('crm_sequences', { eq: { id } })
    if (error) {
      setErrorMsg(`Failed to delete sequence: ${error}`)
    } else {
      setSequences(s => s.filter(x => x.id !== id))
    }
  }

  const cloneSequence = async (sequence: Sequence) => {
    try {
      setIsCreating(true)
      setErrorMsg('')
      
      const { data: fullSeq, error: fetchErr } = await adminApi.select('crm_sequences', '*', { eq: { id: sequence.id } })
      if (fetchErr || !fullSeq || fullSeq.length === 0) throw new Error(fetchErr || 'Sequence not found')

      const { data, error } = await adminApi.insert('crm_sequences', {
        name: `${fullSeq[0].name} (Copy)`,
        status: 'draft',
        trigger_event: fullSeq[0].trigger_event,
        definition: fullSeq[0].definition
      })

      if (error) throw new Error(error)
      if (!data || data.length === 0) throw new Error('No data returned from clone')

      setSequences(s => [data[0], ...s])
    } catch (e: any) {
      setErrorMsg(`Failed to clone sequence: ${e.message}`)
    } finally {
      setIsCreating(false)
    }
  }

  const triggerTestRun = async (seq: Sequence) => {
    const emails = seq.test_emails || []
    const phones = seq.test_phones || []
    if (emails.length === 0 && phones.length === 0) {
      toast("Error: Please set test email/phone inside the Sequence Builder first.")
      return
    }

    setTestingId(seq.id)
    toast("Preparing test leads...")
    try {
      const recipients: { recipient_type: 'lead', recipient_id: string }[] = []

      for (const email of emails) {
        const { data: existingLeads } = await supabase.from('crm_leads').select('id').eq('email', email)
        let leadId = existingLeads?.[0]?.id
        if (leadId) {
          await supabase.from('crm_leads').update({ accepts_email: true, accepts_sms: true }).eq('id', leadId)
        } else {
          const { data: newLead, error: insertError } = await supabase.from('crm_leads').insert({
            name: `Test Lead (${email})`,
            email: email,
            accepts_email: true,
            accepts_sms: true,
            metadata: { is_test: true }
          }).select('id').single()
          if (insertError) throw new Error(`Failed to create lead for ${email}: ${insertError.message}`)
          leadId = newLead.id
        }
        recipients.push({ recipient_type: 'lead', recipient_id: leadId })
      }

      for (const phone of phones) {
        const { data: existingLeads } = await supabase.from('crm_leads').select('id').eq('phone', phone)
        let leadId = existingLeads?.[0]?.id
        if (leadId) {
          await supabase.from('crm_leads').update({ accepts_email: true, accepts_sms: true }).eq('id', leadId)
        } else {
          const { data: newLead, error: insertError } = await supabase.from('crm_leads').insert({
            name: `Test Lead (${phone})`,
            phone: phone,
            accepts_email: true,
            accepts_sms: true,
            metadata: { is_test: true }
          }).select('id').single()
          if (insertError) throw new Error(`Failed to create lead for ${phone}: ${insertError.message}`)
          leadId = newLead.id
        }
        recipients.push({ recipient_type: 'lead', recipient_id: leadId })
      }

      toast("Enrolling leads...")
      const enrollRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enroll-in-sequence`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: seq.id, recipients, reset: true, is_test: true }),
        }
      )
      const enrollData = await enrollRes.json()
      if (!enrollRes.ok) {
        throw new Error(enrollData.error || 'Failed to enroll leads')
      }

      toast("📨 Sending all test messages (skipping wait delays)...")
      const processRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-sequence-step`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: seq.id, test_run_all: true, is_test: true }),
        }
      )
      const processData = await processRes.json()
      if (!processRes.ok) {
        throw new Error(processData.error || 'Failed to process sequence steps')
      }

      const emailsSent = processData.results?.filter((r: any) => r.node_type === 'action_email' && r.action === 'advanced').length || 0
      const smsSent = processData.results?.filter((r: any) => r.node_type === 'action_sms' && r.action === 'advanced').length || 0
      toast(`✅ All test messages sent! ${emailsSent} email(s), ${smsSent} SMS — check your inbox!`, 8000)
    } catch (err: any) {
      toast(`Error: ${err.message}`)
    } finally {
      setTestingId(null)
      const { data } = await adminApi.select('crm_sequences', '*', undefined, { order: { column: 'created_at', ascending: false } })
      if (data) setSequences(data)
    }
  }

  const triggerDryRun = async (seq: Sequence) => {
    try {
      setDryRunLoading(true)
      setSelectedSequenceName(seq.name)
      setShowDryRunModal(true)
      
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dry-run-sequence`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: seq.id }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to simulate dry run')
      }
      setDryRunResults(data.nodes || {})
    } catch (err: any) {
      toast(`Error: ${err.message}`)
      setShowDryRunModal(false)
    } finally {
      setDryRunLoading(false)
    }
  }

  const exportToCSV = (nodeId: string, nodeLabel: string, recipients: any[]) => {
    if (!recipients || recipients.length === 0) return
    const headers = ['Recipient ID', 'Name', 'Email', 'Phone', 'Type']
    const rows = recipients.map(r => [
      r.id,
      r.name,
      r.email || '',
      r.phone || '',
      r.recipient_type
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    const sanitizedLabel = nodeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    link.setAttribute('download', `dry_run_${sanitizedLabel}_recipients.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: '#9ca3af',
    active: '#22c55e',
    archived: '#ef4444',
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Automation Sequences</h1>
          <p className="crm-subtitle">Build multi-step, conditional journeys for your leads and users.</p>
        </div>
        <button onClick={handleCreate} disabled={isCreating} className="crm-btn-primary" style={{ opacity: isCreating ? 0.7 : 1 }}>
          {isCreating ? 'Creating...' : '+ New Sequence'}
        </button>
      </div>

      {globalStats && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>🟢 CRM List Health (Global Metrics)</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Aggregated across all sequences and campaigns to monitor fatigue.</p>
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Total Outbound Sends</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{globalStats.totalSent.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Global Opt-Outs</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                {globalStats.totalUnsubscribed.toLocaleString()} 
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, marginLeft: '6px' }}>
                  ({globalStats.totalSent > 0 ? ((globalStats.totalUnsubscribed / globalStats.totalSent) * 100).toFixed(2) : 0}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', borderRadius: '8px', marginBottom: '24px', fontWeight: 500 }}>
          {errorMsg}
        </div>
      )}

      {toastMsg && (
        <div className={`crm-toast ${toastMsg.startsWith('Error') ? 'error' : 'success'}`} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          fontWeight: 500,
          background: toastMsg.startsWith('Error') ? '#fef2f2' : '#f0fdf4',
          border: toastMsg.startsWith('Error') ? '1px solid #fecaca' : '1px solid #bbf7d0',
          color: toastMsg.startsWith('Error') ? '#991b1b' : '#166534',
        }}>
          <span>{toastMsg}</span>
          <button onClick={() => setToastMsg('')} style={{ background: 'none', border: 'none', fontStyle: 'normal', cursor: 'pointer', fontSize: '1rem', color: 'inherit', paddingLeft: 12 }}>✕</button>
        </div>
      )}

      <div className="crm-table-container">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Trigger</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Loading...</td></tr>
            ) : sequences.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No sequences found. Create one to get started.</td></tr>
            ) : (
              sequences.map(s => (
                <tr key={s.id}>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: STATUS_COLORS[s.status] + '20',
                      color: STATUS_COLORS[s.status],
                      textTransform: 'uppercase'
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, color: '#1f2937' }}>{s.name}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.9rem' }}>{s.trigger_event || 'Manual Enrollment'}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.9rem' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link href={`/crm/sequences/${s.id}`} style={{
                        padding: '4px 12px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        color: '#374151',
                        fontSize: '0.85rem'
                      }}>
                        {s.status === 'draft' ? 'Build' : 'Open'}
                      </Link>
                      <button onClick={() => cloneSequence(s)} style={{
                        padding: '4px 12px',
                        background: '#e0e7ff',
                        border: '1px solid #c7d2fe',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#4f46e5',
                        fontSize: '0.85rem'
                      }}>
                        Clone
                      </button>
                      <Link href={`/crm/sequences/${s.id}/monitor`} style={{
                        padding: '4px 12px',
                        background: '#fef9c3',
                        border: '1px solid #fde68a',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        color: '#854d0e',
                        fontSize: '0.85rem',
                        fontWeight: 600
                      }}>
                        📊 Monitor
                      </Link>
                      <button onClick={() => deleteSequence(s.id)} style={{
                        padding: '4px 12px',
                        background: '#fef2f2',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#ef4444',
                        fontSize: '0.85rem'
                      }}>
                        Delete
                      </button>
                      {(s.status === 'active' || s.status === 'draft') && (
                        <>
                          <button
                            onClick={() => triggerTestRun(s)}
                            disabled={testingId === s.id}
                            style={{
                              padding: '4px 12px',
                              background: '#f5f3ff',
                              border: '1px solid #ddd6fe',
                              borderRadius: '4px',
                              cursor: testingId === s.id ? 'not-allowed' : 'pointer',
                              color: '#7c3aed',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              opacity: testingId === s.id ? 0.7 : 1
                            }}
                          >
                            {testingId === s.id ? 'Testing...' : '🧪 Test'}
                          </button>
                          <button
                            onClick={() => triggerDryRun(s)}
                            disabled={dryRunLoading}
                            style={{
                              padding: '4px 12px',
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              borderRadius: '4px',
                              cursor: dryRunLoading ? 'not-allowed' : 'pointer',
                              color: '#166534',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              opacity: dryRunLoading ? 0.7 : 1
                            }}
                          >
                            🔍 Dry Run
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDryRunModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-container" style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>🔍 Dry Run: {selectedSequenceName}</h2>
              <button onClick={() => { setShowDryRunModal(false); setDryRunResults(null); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {dryRunLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>
                  <svg className="animate-spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px auto', display: 'block', height: '30px', width: '30px', color: '#1a2e1a' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p style={{ margin: 0, fontWeight: 500 }}>Running in-memory sequence simulation...</p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>Evaluating all conditions against target audience</p>
                </div>
              ) : dryRunResults && Object.keys(dryRunResults).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563' }}>
                    Below is the simulated distribution of recipients at each node step.
                  </p>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '10px 16px', fontWeight: 600, color: '#4b5563' }}>Step Node</th>
                          <th style={{ padding: '10px 16px', fontWeight: 600, color: '#4b5563' }}>Type</th>
                          <th style={{ padding: '10px 16px', fontWeight: 600, color: '#4b5563', textAlign: 'center' }}>Count</th>
                          <th style={{ padding: '10px 16px', fontWeight: 600, color: '#4b5563', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(dryRunResults).map(([nodeId, data]: [string, any]) => (
                          <tr key={nodeId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 500 }}>{nodeId}</td>
                            <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.85rem' }}>{nodeId.split('_')[0].toUpperCase()}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#16a34a' }}>{data.count}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <button
                                onClick={() => exportToCSV(nodeId, nodeId, data.recipients)}
                                disabled={data.count === 0}
                                style={{
                                  padding: '4px 8px',
                                  background: data.count === 0 ? '#f3f4f6' : '#1a2e1a',
                                  color: data.count === 0 ? '#9ca3af' : 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: data.count === 0 ? 'not-allowed' : 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: 500
                                }}
                              >
                                Export CSV
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280' }}>
                  No nodes were simulated. Make sure the sequence has a start trigger and nodes.
                </div>
              )}
            </div>
            
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', background: '#f9fafb' }}>
              <button onClick={() => { setShowDryRunModal(false); setDryRunResults(null); }} style={{ padding: '8px 16px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; }
        .crm-btn-primary { background: #1a2e1a; color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; }
        .crm-btn-primary:hover { background: #2a3e2a; }
        .crm-table-container { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; }
        .crm-table { width: 100%; border-collapse: collapse; text-align: left; }
        .crm-table th { padding: 12px 24px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 0.8rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .crm-table td { padding: 16px 24px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
