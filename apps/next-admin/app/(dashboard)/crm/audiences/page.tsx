'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { adminApi } from '../../../../lib/adminApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Audience = {
  id: string
  name: string
  description: string | null
  audience_rpc_name: string
  estimated_count: number | null
  created_at: string
  // New dynamic fields
  query_sql: string | null
  query_source: string | null
  ai_prompt: string | null
  ai_explanation: string | null
  is_dynamic: boolean
}

type AudienceFunction = {
  id: string
  name: string
  label: string
  description: string | null
  is_rpc: boolean
  is_active: boolean
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  sql?: string
  explanation?: string
  estimatedCount?: number
  sampleRows?: any[]
  error?: string
}

// Always-available fallback sentinel for ad-hoc functions not yet in the registry
const CUSTOM_SENTINEL = '__custom__'

type CreateMode = 'legacy' | 'ai'

const defaultForm = {
  name:               '',
  description:        '',
  source:             'crm_audience_all',
  custom_fn:          '',
}

export default function CrmAudiencesPage() {
  const [audiences, setAudiences]       = useState<Audience[]>([])
  const [audienceFns, setAudienceFns]   = useState<AudienceFunction[]>([])
  const [fnsLoading, setFnsLoading]     = useState(true)
  const [loading, setLoading]           = useState(true)
  const [creating, setCreating]         = useState(false)
  const [createMode, setCreateMode]     = useState<CreateMode>('ai')
  const [saving, setSaving]             = useState(false)
  const [message, setMessage]           = useState('')
  const [form, setForm]                 = useState(defaultForm)
  const [testingAudience, setTestingAudience] = useState<Audience | null>(null)
  const [testResults, setTestResults]   = useState<any[]>([])
  const [testing, setTesting]           = useState(false)

  // AI Chat state
  const [aiName, setAiName]             = useState('')
  const [aiDescription, setAiDescription] = useState('')
  const [aiPrompt, setAiPrompt]         = useState('')
  const [chatHistory, setChatHistory]   = useState<ChatMessage[]>([])
  const [aiGenerating, setAiGenerating] = useState(false)
  const [currentSql, setCurrentSql]     = useState<string | null>(null)
  const [currentExplanation, setCurrentExplanation] = useState<string | null>(null)
  const [currentCount, setCurrentCount] = useState<number | null>(null)
  const [currentSample, setCurrentSample] = useState<any[]>([])
  const [showSql, setShowSql]           = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Edit mode state
  const [editingAudience, setEditingAudience] = useState<Audience | null>(null)

  const fetchAudiences = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_audiences')
      .select('*')
      .order('created_at', { ascending: false })
    setAudiences((data as Audience[]) ?? [])
    setLoading(false)
  }

  const fetchAudienceFunctions = async () => {
    setFnsLoading(true)
    const { data } = await supabase
      .from('crm_audience_functions')
      .select('*')
      .eq('is_active', true)
      .order('label')
    setAudienceFns((data as AudienceFunction[]) ?? [])
    setFnsLoading(false)
  }

  useEffect(() => {
    fetchAudiences()
    fetchAudienceFunctions()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const toast = (msg: string, ms = 4000) => { 
    setMessage(msg); 
    if (!msg.startsWith('Error')) setTimeout(() => setMessage(''), ms) 
  }

  const estimateSize = async (rpcName: string): Promise<number | null> => {
    if (rpcName === CUSTOM_SENTINEL) return null
    const { data, error } = await supabase.rpc(rpcName)
    if (error || !data) return null
    return (data as unknown[]).length
  }

  // ─── Legacy audience creation (RPC-based) ────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)

    const rpcName = form.source === CUSTOM_SENTINEL
      ? (form.custom_fn.trim() || 'crm_audience_all')
      : form.source

    const size = await estimateSize(rpcName)

    const { error } = await supabase.from('crm_audiences').insert({
      name:              form.name,
      description:       form.description || null,
      audience_rpc_name: rpcName,
      estimated_count:   size,
      is_dynamic:        false,
      query_source:      'legacy',
    })

    if (!error) {
      setCreating(false)
      setForm(defaultForm)
      toast(`Audience created${size != null ? ` (est. ${size.toLocaleString()} recipients)` : ''}`)
      fetchAudiences()
    }
    setSaving(false)
  }

  // ─── AI audience generation ──────────────────────────────────────────────
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiGenerating(true)

    const userMessage: ChatMessage = { role: 'user', content: aiPrompt }
    setChatHistory(prev => [...prev, userMessage])

    const conversationHistory = chatHistory.map(m => ({
      role: m.role,
      content: m.role === 'assistant' 
        ? (m.explanation || m.content) + (m.sql ? `\n\nGenerated SQL:\n${m.sql}` : '')
        : m.content
    }))
    conversationHistory.push({ role: 'user', content: aiPrompt })

    setAiPrompt('')

    try {
      const { data, error } = await adminApi.invokeFunction('generate-audience-query', {
        prompt: aiPrompt,
        currentSql: currentSql || undefined,
        conversationHistory,
      })

      if (error) {
        const errMsg: ChatMessage = { role: 'assistant', content: `Failed to generate query: ${error}`, error: error }
        setChatHistory(prev => [...prev, errMsg])
      } else if (data) {
        const result = data as any
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.explanation || 'Query generated successfully.',
          sql: result.sql,
          explanation: result.explanation,
          estimatedCount: result.estimatedCount,
          sampleRows: result.sampleRows,
          error: result.error,
        }
        setChatHistory(prev => [...prev, assistantMessage])

        if (result.valid) {
          setCurrentSql(result.sql)
          setCurrentExplanation(result.explanation)
          setCurrentCount(result.estimatedCount)
          setCurrentSample(result.sampleRows || [])
        }
      }
    } catch (err: any) {
      const errMsg: ChatMessage = { role: 'assistant', content: `Error: ${err.message}`, error: err.message }
      setChatHistory(prev => [...prev, errMsg])
    }

    setAiGenerating(false)
  }

  const handleSaveAiAudience = async () => {
    if (!aiName.trim() || !currentSql) return
    setSaving(true)

    const insertData: any = {
      name:            aiName,
      description:     aiDescription || currentExplanation || null,
      query_sql:       currentSql,
      query_source:    'ai',
      ai_prompt:       chatHistory.filter(m => m.role === 'user').map(m => m.content).join('\n---\n'),
      ai_explanation:  currentExplanation,
      estimated_count: currentCount,
      is_dynamic:      true,
      audience_rpc_name: 'execute_audience_query', // placeholder for legacy compat
    }

    if (editingAudience) {
      const { error } = await supabase
        .from('crm_audiences')
        .update(insertData)
        .eq('id', editingAudience.id)
      if (error) {
        toast(`Error updating audience: ${error.message}`)
      } else {
        toast('Audience updated successfully!')
        resetAiForm()
        fetchAudiences()
      }
    } else {
      const { error } = await supabase.from('crm_audiences').insert(insertData)
      if (error) {
        toast(`Error creating audience: ${error.message}`)
      } else {
        toast(`AI audience "${aiName}" created (est. ${currentCount?.toLocaleString() ?? '?'} recipients)`)
        resetAiForm()
        fetchAudiences()
      }
    }
    setSaving(false)
  }

  const resetAiForm = () => {
    setCreating(false)
    setAiName('')
    setAiDescription('')
    setAiPrompt('')
    setChatHistory([])
    setCurrentSql(null)
    setCurrentExplanation(null)
    setCurrentCount(null)
    setCurrentSample([])
    setShowSql(false)
    setEditingAudience(null)
  }

  const handleEditAiAudience = (audience: Audience) => {
    setEditingAudience(audience)
    setCreating(true)
    setCreateMode('ai')
    setAiName(audience.name)
    setAiDescription(audience.description || '')
    setCurrentSql(audience.query_sql)
    setCurrentExplanation(audience.ai_explanation)
    setCurrentCount(audience.estimated_count)
    setChatHistory(audience.ai_prompt ? [{
      role: 'user' as const,
      content: audience.ai_prompt,
    }, {
      role: 'assistant' as const,
      content: audience.ai_explanation || 'Query loaded from saved audience.',
      sql: audience.query_sql || undefined,
      explanation: audience.ai_explanation || undefined,
      estimatedCount: audience.estimated_count || undefined,
    }] : [])
  }

  const deleteAudience = async (id: string) => {
    await supabase.from('crm_audiences').delete().eq('id', id)
    setAudiences(prev => prev.filter(a => a.id !== id))
  }

  const testAudience = async (audience: Audience) => {
    setTestingAudience(audience)
    setTesting(true)
    
    if (audience.is_dynamic && audience.query_sql) {
      // Dynamic audience — execute via the validated executor
      const { data, error } = await adminApi.rpc('execute_audience_query', {
        p_query: audience.query_sql + ' LIMIT 100'
      })
      if (!error && data) {
        setTestResults(data as any[])
      } else {
        setTestResults([])
        toast(`Failed to execute audience query: ${error || 'Unknown error'}`)
      }
    } else {
      // Legacy RPC-based audience
      const { data, error } = await supabase.rpc(audience.audience_rpc_name)
      if (!error && data) {
        setTestResults((data as any[]).slice(0, 100))
      } else {
        setTestResults([])
        toast('Failed to execute audience function')
      }
    }
    setTesting(false)
  }

  const sourceLabel = (audience: Audience) => {
    if (audience.is_dynamic) return audience.ai_explanation?.slice(0, 60) || 'AI-generated query'
    return audienceFns.find(f => f.name === audience.audience_rpc_name)?.label ?? audience.audience_rpc_name
  }

  const sourceBadge = (audience: Audience) => {
    if (!audience.is_dynamic) return 'Legacy'
    if (audience.query_source === 'ai') return 'AI'
    if (audience.query_source === 'manual') return 'SQL'
    return 'Dynamic'
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Audiences</h1>
          <p className="crm-subtitle">
            Define reusable recipient segments for email/SMS campaigns.
            Use AI to describe your audience in plain English, or select a pre-built function.
          </p>
        </div>
        {!creating && (
          <button id="create-audience-btn" className="crm-btn-primary" onClick={() => setCreating(true)}>
            + New Audience
          </button>
        )}
      </div>

      {message && (
        <div className={`crm-toast ${message.startsWith('Error') ? 'error' : 'success'}`}>
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {creating && (
        <div className="crm-form-card">
          <div className="crm-form-header">
            <h2 className="crm-form-title">{editingAudience ? 'Edit Audience' : 'Create Audience'}</h2>
            <div className="crm-mode-toggle">
              <button
                className={`mode-btn ${createMode === 'ai' ? 'active' : ''}`}
                onClick={() => setCreateMode('ai')}
              >
                ✨ AI Builder
              </button>
              <button
                className={`mode-btn ${createMode === 'legacy' ? 'active' : ''}`}
                onClick={() => setCreateMode('legacy')}
              >
                ⚙️ Legacy (RPC)
              </button>
            </div>
          </div>

          {createMode === 'ai' ? (
            /* ────────────────── AI Builder Mode ────────────────── */
            <div className="ai-builder">
              {/* Name + Description */}
              <div className="crm-form-grid col2">
                <div className="crm-field">
                  <label>Audience Name *</label>
                  <input
                    placeholder="e.g. High-Value California Buyers"
                    value={aiName}
                    onChange={e => setAiName(e.target.value)}
                  />
                </div>
                <div className="crm-field">
                  <label>Description <span className="crm-hint">— auto-filled by AI</span></label>
                  <input
                    placeholder="Will be auto-generated from your prompt…"
                    value={aiDescription}
                    onChange={e => setAiDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Chat Interface */}
              <div className="ai-chat-container">
                <div className="ai-chat-messages">
                  {chatHistory.length === 0 && (
                    <div className="ai-welcome">
                      <div className="ai-welcome-icon">✨</div>
                      <h3>Describe your audience</h3>
                      <p>Tell me who you want to reach in plain English. I&apos;ll generate the query for you.</p>
                      <div className="ai-examples">
                        <button className="ai-example-chip" onClick={() => setAiPrompt('All users in California who have purchased something')}>
                          Users in California who have purchased
                        </button>
                        <button className="ai-example-chip" onClick={() => setAiPrompt('Leads from Facebook ads who signed up in the last 30 days')}>
                          Facebook leads from last 30 days
                        </button>
                        <button className="ai-example-chip" onClick={() => setAiPrompt('Sellers with average rating above 4.5 who have not posted a product in 60 days')}>
                          Inactive high-rated sellers
                        </button>
                        <button className="ai-example-chip" onClick={() => setAiPrompt('Users who have bought organic produce more than 3 times')}>
                          Repeat organic buyers
                        </button>
                      </div>
                    </div>
                  )}

                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                      <div className="chat-bubble">
                        <div className="chat-content">{msg.content}</div>
                        {msg.error && !msg.sql && (
                          <div className="chat-error">⚠️ {msg.error}</div>
                        )}
                        {msg.sql && (
                          <div className="chat-sql-section">
                            <button 
                              className="chat-sql-toggle" 
                              onClick={() => setShowSql(s => !s)}
                            >
                              {showSql ? '▾ Hide SQL' : '▸ Show SQL'}
                            </button>
                            {showSql && (
                              <pre className="chat-sql-code">{msg.sql}</pre>
                            )}
                          </div>
                        )}
                        {msg.estimatedCount != null && (
                          <div className="chat-count">
                            📊 Estimated: <strong>{msg.estimatedCount.toLocaleString()}</strong> recipients
                          </div>
                        )}
                        {msg.sampleRows && msg.sampleRows.length > 0 && (
                          <div className="chat-sample">
                            <div className="chat-sample-label">Sample results:</div>
                            <div className="chat-sample-table-wrap">
                              <table className="chat-sample-table">
                                <thead>
                                  <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>State</th>
                                    <th>Type</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.sampleRows.map((r: any, j: number) => (
                                    <tr key={j}>
                                      <td>{r.name || '—'}</td>
                                      <td>{r.email || '—'}</td>
                                      <td>{r.phone || '—'}</td>
                                      <td>{r.state_code || '—'}</td>
                                      <td><span className={`type-badge ${r.recipient_type}`}>{r.recipient_type}</span></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {aiGenerating && (
                    <div className="chat-message assistant">
                      <div className="chat-bubble">
                        <div className="chat-loading">
                          <span className="loading-dot"></span>
                          <span className="loading-dot"></span>
                          <span className="loading-dot"></span>
                          <span style={{ marginLeft: 8, color: '#9ca3af' }}>Generating query…</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input area */}
                <div className="ai-chat-input-area">
                  <div className="ai-chat-input-row">
                    <textarea
                      className="ai-chat-input"
                      placeholder={currentSql ? 'Refine your audience… (e.g. "also exclude anyone who got an email last week")' : 'Describe your audience in plain English…'}
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleAiGenerate()
                        }
                      }}
                      rows={2}
                      disabled={aiGenerating}
                    />
                    <button 
                      className="ai-send-btn"
                      onClick={handleAiGenerate}
                      disabled={aiGenerating || !aiPrompt.trim()}
                    >
                      {aiGenerating ? '⏳' : '➤'}
                    </button>
                  </div>
                  {currentSql && (
                    <p className="ai-chat-hint">
                      💡 You can refine the query by describing what to change. Press Enter to send.
                    </p>
                  )}
                </div>
              </div>

              {/* Save bar */}
              <div className="crm-form-actions">
                <button 
                  className="crm-btn-primary" 
                  onClick={handleSaveAiAudience} 
                  disabled={saving || !aiName.trim() || !currentSql}
                >
                  {saving ? 'Saving…' : editingAudience ? 'Update Audience' : 'Save Audience'}
                </button>
                <button className="crm-btn-secondary" onClick={resetAiForm}>Cancel</button>
                {currentSql && (
                  <span className="save-hint">
                    ✓ Valid query ready — {currentCount?.toLocaleString() ?? '?'} recipients
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* ────────────────── Legacy Mode (original form) ────────────────── */
            <>
              {/* Row 1 — Name + Description */}
              <div className="crm-form-grid col2">
                <div className="crm-field">
                  <label>Audience Name *</label>
                  <input
                    placeholder="e.g. California Buyers"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="crm-field">
                  <label>Description</label>
                  <input
                    placeholder="Internal notes…"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* Population source */}
              <div className="crm-section-label">Population Source</div>
              <div className="crm-form-grid col2">
                <div className="crm-field">
                  <label>
                    Base Population
                    {fnsLoading && <span className="crm-hint"> — loading…</span>}
                  </label>
                  <select
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value, custom_fn: '' }))}
                    disabled={fnsLoading}
                  >
                    {audienceFns.map(fn => (
                      <option key={fn.name} value={fn.name}>
                        {fn.label}
                      </option>
                    ))}
                    <option value={CUSTOM_SENTINEL}>⚡ Custom edge function…</option>
                  </select>
                  {form.source !== CUSTOM_SENTINEL && (
                    <p className="crm-hint" style={{ marginTop: 4 }}>
                      {audienceFns.find(f => f.name === form.source)?.description ?? ''}
                    </p>
                  )}
                </div>
                {form.source === CUSTOM_SENTINEL && (
                  <div className="crm-field">
                    <label>
                      Edge Function Name
                      <span className="crm-hint"> — must be deployed to Supabase Functions</span>
                    </label>
                    <input
                      placeholder="e.g. crm_audience_high_value_buyers"
                      value={form.custom_fn}
                      onChange={e => setForm(f => ({ ...f, custom_fn: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              {form.source === CUSTOM_SENTINEL && (
                <div className="crm-info-box">
                  ⚡ Enter any deployed Supabase edge function name. It will receive the filter criteria as arguments and must return
                  an array of <code>{'{ id, email, phone }'}</code> records.<br />
                  Once deployed and tested, register it in the <strong>Audience Functions registry</strong> so it appears in this dropdown automatically.
                </div>
              )}

              <div className="crm-form-actions">
                <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name}>
                  {saving ? 'Creating…' : 'Create Audience'}
                </button>
                <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Audience Name</th>
              <th>Source</th>
              <th>Type</th>
              <th>Est. Size</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="crm-empty">Loading…</td></tr>
            ) : audiences.length === 0 ? (
              <tr><td colSpan={6} className="crm-empty">No audiences yet. Create one to use in campaigns.</td></tr>
            ) : audiences.map(a => (
              <tr key={a.id} data-testid={`audience-row-${a.id}`}>
                <td>
                  <div className="crm-name">{a.name}</div>
                  {a.description && <div className="crm-muted">{a.description}</div>}
                </td>
                <td className="crm-muted">{sourceLabel(a)}</td>
                <td>
                  <span className={`crm-badge source-${sourceBadge(a).toLowerCase()}`}>
                    {sourceBadge(a) === 'AI' && '✨ '}{sourceBadge(a)}
                  </span>
                </td>
                <td>
                  {a.estimated_count != null
                    ? <span className="crm-badge size">{a.estimated_count.toLocaleString()}</span>
                    : '—'}
                </td>
                <td className="crm-muted">{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {a.is_dynamic && (
                      <button
                        className="crm-btn-secondary-sm"
                        onClick={() => handleEditAiAudience(a)}
                        data-testid={`audience-edit-${a.id}`}
                      >Edit</button>
                    )}
                    <button
                      className="crm-btn-secondary-sm"
                      onClick={() => testAudience(a)}
                      data-testid={`audience-test-${a.id}`}
                    >Test</button>
                    <button
                      className="crm-btn-danger-sm"
                      onClick={() => deleteAudience(a.id)}
                      data-testid={`audience-delete-${a.id}`}
                    >Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Test Results Modal */}
      {testingAudience && (
        <div className="crm-modal-overlay">
          <div className="crm-modal">
            <div className="crm-modal-header">
              <h3>Testing: {testingAudience.name}</h3>
              <button onClick={() => setTestingAudience(null)}>✕</button>
            </div>
            <div className="crm-modal-body">
              {testing ? (
                <p className="crm-muted">Executing query...</p>
              ) : testResults.length === 0 ? (
                <p className="crm-muted">No recipients found for this audience.</p>
              ) : (
                <div className="crm-table-wrap" style={{ maxHeight: '400px', margin: 0 }}>
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>State</th>
                        <th>City</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResults.map((r, i) => (
                        <tr key={i}>
                          <td>{r.email || '—'}</td>
                          <td>{r.name || '—'}</td>
                          <td>{r.phone || '—'}</td>
                          <td>{r.state_code || '—'}</td>
                          <td>{r.city || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; max-width: 520px; }
        .crm-toast { display: flex; align-items: center; justify-content: space-between; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-weight: 500; }
        .crm-toast.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
        .crm-toast.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .toast-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; opacity: 0.6; padding: 0 0 0 12px; }
        .toast-close:hover { opacity: 1; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; color: #1a2e1a; margin: 0; }
        .crm-form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }

        /* Mode toggle */
        .crm-mode-toggle { display: flex; gap: 4px; background: #f3f4f6; border-radius: 10px; padding: 3px; }
        .mode-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; background: transparent; color: #6b7280; transition: all 0.2s; }
        .mode-btn.active { background: white; color: #1a2e1a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .mode-btn:hover:not(.active) { color: #374151; }

        .crm-section-label { font-size: 0.75rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin: 20px 0 10px; }
        .crm-form-grid { display: grid; gap: 16px; margin-bottom: 4px; }
        .crm-form-grid.col2 { grid-template-columns: 1fr 1fr; }
        .crm-form-grid.col3 { grid-template-columns: 1fr 1fr 1fr; }

        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-field input, .crm-field select { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
        .crm-field input:focus, .crm-field select:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }

        .crm-info-box { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px 16px; font-size: 0.85rem; color: #6d28d9; margin-bottom: 8px; line-height: 1.5; }
        .crm-info-box code { background: #ede9fe; border-radius: 4px; padding: 1px 5px; font-family: monospace; }

        /* Toggle buttons for consent */
        .crm-toggles { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .crm-toggle { display: flex; align-items: center; gap: 10px; border: 2px solid #d1d5db; border-radius: 24px; padding: 8px 16px 8px 8px; background: #f9fafb; cursor: pointer; font-size: 0.9rem; color: #374151; font-weight: 500; transition: all 0.2s; }
        .crm-toggle:hover { border-color: #4ade80; background: #f0fdf4; }
        .crm-toggle.active { border-color: #22c55e; background: #dcfce7; color: #166534; }
        .toggle-dot { width: 20px; height: 20px; border-radius: 50%; background: #d1d5db; transition: background 0.2s; flex-shrink: 0; }
        .crm-toggle.active .toggle-dot { background: #22c55e; }
        .crm-hint-block { font-size: 0.8rem; color: #9ca3af; margin: 0; }
        .zip-lookup-wrap { margin-bottom: 12px; }
        .zip-search-row { display: flex; align-items: center; gap: 10px; }
        .zip-search-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; width: 220px; }
        .zip-search-input:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .zip-selected-chip { display: inline-flex; align-items: center; gap: 8px; background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; border-radius: 20px; padding: 4px 12px; font-size: 0.85rem; font-weight: 500; }
        .zip-selected-chip button { background: none; border: none; cursor: pointer; color: #16a34a; font-size: 1rem; line-height: 1; padding: 0; }
        .zip-results { border: 1px solid #e5e7eb; border-radius: 8px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin-top: 4px; overflow: hidden; max-width: 480px; }
        .zip-result-item { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 10px 14px; background: none; border: none; border-bottom: 1px solid #f3f4f6; cursor: pointer; text-align: left; font-size: 0.9rem; color: #374151; transition: background 0.1s; }
        .zip-result-item:last-child { border-bottom: none; }
        .zip-result-item:hover { background: #f0fdf4; }
        .zip-result-main { display: flex; align-items: center; gap: 12px; }
        .zip-result-main strong { font-family: monospace; color: #1a2e1a; min-width: 54px; }
        .zip-result-main span { color: #6b7280; }
        .zip-result-communities { display: flex; flex-wrap: wrap; gap: 4px; padding-left: 66px; }
        .community-chip { background: #e0f2fe; color: #0369a1; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; font-weight: 500; }

        .crm-form-actions { display: flex; gap: 12px; margin-top: 20px; align-items: center; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-danger-sm { background: white; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .crm-btn-secondary-sm { background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .crm-btn-secondary-sm:hover { background: #f3f4f6; }

        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; margin-top: 8px; }
        .crm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .crm-table th { background: #f9fafb; padding: 10px 14px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .crm-table tr:last-child td { border-bottom: none; }
        .crm-name { font-weight: 600; color: #1a2e1a; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; }
        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 500; display: inline-block; margin: 2px; }
        .crm-badge.filter { background: #ede9fe; color: #7c3aed; }
        .crm-badge.size { background: #ecfdf5; color: #059669; }
        .crm-badge.source-ai { background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff; }
        .crm-badge.source-legacy { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
        .crm-badge.source-sql { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .crm-badge.source-dynamic { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; }

        .crm-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .crm-modal { background: white; border-radius: 12px; width: 800px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
        .crm-modal-header { padding: 16px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .crm-modal-header h3 { margin: 0; font-size: 1.1rem; color: #111827; }
        .crm-modal-header button { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #6b7280; }
        .crm-modal-body { padding: 24px; overflow-y: auto; }

        .save-hint { font-size: 0.85rem; color: #059669; font-weight: 500; }

        /* ─── AI Chat Styles ─── */
        .ai-builder { margin-top: 16px; }
        .ai-chat-container { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fafafa; }
        .ai-chat-messages { padding: 20px; min-height: 200px; max-height: 480px; overflow-y: auto; }

        .ai-welcome { text-align: center; padding: 24px 16px; }
        .ai-welcome-icon { font-size: 2.5rem; margin-bottom: 8px; }
        .ai-welcome h3 { font-size: 1.1rem; font-weight: 700; color: #1a2e1a; margin: 0 0 6px; }
        .ai-welcome p { color: #6b7280; font-size: 0.9rem; margin: 0 0 16px; }
        .ai-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .ai-example-chip { background: white; border: 1px solid #e5e7eb; border-radius: 20px; padding: 8px 16px; font-size: 0.82rem; color: #374151; cursor: pointer; transition: all 0.15s; }
        .ai-example-chip:hover { border-color: #a78bfa; background: #faf5ff; color: #6d28d9; }

        .chat-message { margin-bottom: 16px; display: flex; }
        .chat-message.user { justify-content: flex-end; }
        .chat-message.assistant { justify-content: flex-start; }
        .chat-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 0.9rem; line-height: 1.5; }
        .chat-message.user .chat-bubble { background: #22c55e; color: white; border-bottom-right-radius: 4px; }
        .chat-message.assistant .chat-bubble { background: white; color: #374151; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
        .chat-content { white-space: pre-wrap; }
        .chat-error { margin-top: 8px; padding: 8px 12px; background: #fef2f2; border-radius: 6px; color: #991b1b; font-size: 0.82rem; }

        .chat-sql-section { margin-top: 10px; }
        .chat-sql-toggle { background: none; border: none; color: #7c3aed; font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0; }
        .chat-sql-toggle:hover { text-decoration: underline; }
        .chat-sql-code { background: #1e1e2e; color: #cdd6f4; padding: 12px; border-radius: 8px; font-size: 0.78rem; overflow-x: auto; margin-top: 6px; white-space: pre-wrap; word-break: break-all; font-family: 'SF Mono', 'Fira Code', monospace; }

        .chat-count { margin-top: 10px; padding: 8px 12px; background: #ecfdf5; border-radius: 8px; color: #059669; font-size: 0.85rem; }
        .chat-sample { margin-top: 10px; }
        .chat-sample-label { font-size: 0.78rem; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
        .chat-sample-table-wrap { overflow-x: auto; border-radius: 6px; border: 1px solid #e5e7eb; }
        .chat-sample-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .chat-sample-table th { background: #f9fafb; padding: 6px 10px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.72rem; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .chat-sample-table td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
        .chat-sample-table tr:last-child td { border-bottom: none; }
        .type-badge { padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 500; }
        .type-badge.user { background: #eff6ff; color: #2563eb; }
        .type-badge.lead { background: #fef3c7; color: #b45309; }

        .chat-loading { display: flex; align-items: center; gap: 4px; }
        .loading-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; animation: dotPulse 1.2s infinite ease-in-out; }
        .loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }

        .ai-chat-input-area { border-top: 1px solid #e5e7eb; padding: 12px 16px; background: white; }
        .ai-chat-input-row { display: flex; gap: 8px; align-items: flex-end; }
        .ai-chat-input { flex: 1; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; resize: none; outline: none; font-family: inherit; line-height: 1.4; }
        .ai-chat-input:focus { border-color: #a78bfa; box-shadow: 0 0 0 3px rgba(167,139,250,0.15); }
        .ai-chat-input:disabled { background: #f9fafb; color: #9ca3af; }
        .ai-send-btn { width: 42px; height: 42px; border-radius: 10px; border: none; background: #7c3aed; color: white; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
        .ai-send-btn:hover:not(:disabled) { background: #6d28d9; }
        .ai-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ai-chat-hint { font-size: 0.78rem; color: #9ca3af; margin: 6px 0 0; }
      `}</style>
    </div>
  )
}
