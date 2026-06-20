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
  const router = useRouter()

  const toast = (msg: string, ms = 5000) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(prev => prev === msg ? '' : prev), ms)
  }

  useEffect(() => {
    const fetchSequences = async () => {
      setLoading(true)
      const { data } = await adminApi.select('crm_sequences', '*', undefined, { order: { column: 'created_at', ascending: false } })
      if (data) setSequences(data)
      setLoading(false)
    }
    fetchSequences()
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
          body: JSON.stringify({ sequence_id: seq.id, recipients }),
        }
      )
      const enrollData = await enrollRes.json()
      if (!enrollRes.ok) {
        throw new Error(enrollData.error || 'Failed to enroll leads')
      }

      toast("Executing sequence step...")
      const processRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-sequence-step`,
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
      const processData = await processRes.json()
      if (!processRes.ok) {
        throw new Error(processData.error || 'Failed to process sequence step')
      }

      toast("Test run triggered successfully!")
    } catch (err: any) {
      toast(`Error: ${err.message}`)
    } finally {
      setTestingId(null)
      const { data } = await adminApi.select('crm_sequences', '*', undefined, { order: { column: 'created_at', ascending: false } })
      if (data) setSequences(data)
    }
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
                      {s.status === 'active' && (
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
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
      `}</style>
    </div>
  )
}
