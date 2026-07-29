'use client'

import React, { useEffect, useState } from 'react'
import { fetchLogSearch, type LogEventRow } from '../../../lib/portal-service'

type LogCategory = 'events' | 'visits' | 'client_errors' | 'edge_errors'

export function LogSearchView() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<LogCategory>('events')
  const [logs, setLogs] = useState<LogEventRow[]>([])
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchLogSearch(query, category).then(res => {
      if (active) {
        setLogs(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [query, category])

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">System & Audit Log Search</h1>
          <p className="page-subtitle">Real-time user analytics, page visit sessions, client UI errors, and edge function audit trail</p>
        </div>

        {/* Real-time Collection Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16, 185, 129, 0.12)', padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-green)' }}>Live Event Collection Active</span>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setCategory('events')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: category === 'events' ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                background: category === 'events' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: category === 'events' ? 'var(--accent-green)' : 'var(--text-main)',
                fontWeight: category === 'events' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              📱 User Page Events (crm_page_events)
            </button>

            <button
              onClick={() => setCategory('visits')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: category === 'visits' ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                background: category === 'visits' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: category === 'visits' ? 'var(--accent-green)' : 'var(--text-main)',
                fontWeight: category === 'visits' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              🌐 Visit Sessions (crm_page_visits)
            </button>

            <button
              onClick={() => setCategory('client_errors')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: category === 'client_errors' ? '1px solid var(--accent-red)' : '1px solid var(--border-subtle)',
                background: category === 'client_errors' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: category === 'client_errors' ? 'var(--accent-red)' : 'var(--text-main)',
                fontWeight: category === 'client_errors' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              ⚠️ Client UI Errors (client_errors)
            </button>

            <button
              onClick={() => setCategory('edge_errors')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: category === 'edge_errors' ? '1px solid var(--accent-orange)' : '1px solid var(--border-subtle)',
                background: category === 'edge_errors' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: category === 'edge_errors' ? 'var(--accent-orange)' : 'var(--text-main)',
                fontWeight: category === 'edge_errors' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              ⚙️ Edge Audit Logs (edge_function_errors)
            </button>
          </div>

          <input
            type="text"
            placeholder="Filter logs by keyword, event, session ID, route..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              width: 320,
              fontSize: '0.875rem',
            }}
          />
        </div>

        {/* Logs Table */}
        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <span>Fetching live system logs...</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Event / Source</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Route / Page</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Session ID</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>JSON Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                      No matching log records found in live system database
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{log.event_type}</td>
                      <td style={{ padding: '12px 16px' }}><span className="code">{log.page_slug}</span></td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{log.session_id.slice(0, 16)}...</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => setSelectedPayload(log.payload)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--chart-1)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          View Payload
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Payload Inspector Modal */}
      {selectedPayload && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: 20,
        }}>
          <div className="card glass" style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Inspect Log Event Payload</h2>
              <button
                onClick={() => setSelectedPayload(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <pre style={{
              background: '#0d1117',
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              color: '#38bdf8',
              fontSize: '0.85rem',
              maxHeight: 360,
              overflowY: 'auto',
            }}>
              {JSON.stringify(selectedPayload, null, 2)}
            </pre>

            <button
              onClick={() => setSelectedPayload(null)}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'var(--chart-1)',
                color: '#000',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
