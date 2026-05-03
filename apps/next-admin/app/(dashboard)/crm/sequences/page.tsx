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
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

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
