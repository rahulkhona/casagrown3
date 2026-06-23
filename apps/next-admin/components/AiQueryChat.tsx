'use client'

import { useState, useRef, useEffect } from 'react'

// ── Lightweight SQL formatter for readable display ──────────────────────────
export function formatSql(sql: string): string {
  if (!sql) return sql;
  // Normalize whitespace
  let s = sql.replace(/\s+/g, ' ').trim();
  // Add newlines before major keywords
  s = s.replace(/\b(FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|CROSS JOIN|ON|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|UNION ALL|UNION|EXCEPT|INTERSECT)\b/gi, '\n$1');
  // Break SELECT columns: after SELECT keyword, split on commas
  s = s.replace(/^SELECT\s+(DISTINCT\s+)?/i, (match) => 'SELECT ' + (match.includes('DISTINCT') ? 'DISTINCT\n  ' : '\n  '));
  // Break AND/OR onto new lines
  s = s.replace(/\b(AND|OR)\b/gi, '\n  $1');
  // Break commas in SELECT clause (before FROM) into separate lines
  const fromIdx = s.search(/\nFROM\b/i);
  if (fromIdx > 0) {
    const selectPart = s.substring(0, fromIdx);
    const rest = s.substring(fromIdx);
    const formattedSelect = selectPart.replace(/,\s*/g, ',\n  ');
    s = formattedSelect + rest;
  }
  return s;
}

// ── ChatMessage type ────────────────────────────────────────────────────────
export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  sql?: string
  explanation?: string
  estimatedCount?: number
  sampleRows?: any[]
  error?: string
}

// ── Default example prompts ─────────────────────────────────────────────────
const DEFAULT_EXAMPLE_PROMPTS = [
  { label: 'Users in California who have purchased', prompt: 'All users in California who have purchased something' },
  { label: 'Facebook leads from last 30 days', prompt: 'Leads from Facebook ads who signed up in the last 30 days' },
  { label: 'Inactive high-rated sellers', prompt: 'Sellers with average rating above 4.5 who have not posted a product in 60 days' },
  { label: 'Leads without accounts', prompt: 'All leads that have not signed up for an account yet' },
]

// ── Props ───────────────────────────────────────────────────────────────────
type AiQueryChatProps = {
  /** Called whenever the SQL changes (generated or manually edited) */
  onSqlChange: (sql: string) => void
  /** Called whenever the explanation changes */
  onExplanationChange?: (explanation: string) => void
  /** Called whenever estimated count changes */
  onCountChange?: (count: number) => void
  /** Optional initial SQL (for editing an existing query) */
  initialSql?: string
  /** Optional initial prompt */
  initialPrompt?: string
  /** Optional initial explanation */
  initialExplanation?: string
  /** Optional initial chat history */
  initialChatHistory?: ChatMessage[]
  /** Whether the component is disabled/locked */
  disabled?: boolean
  /** Compact mode — smaller height, for inline use in sidebars like SequenceBuilder */
  compact?: boolean
  /** Optional custom placeholder text */
  placeholder?: string
  /** Optional example chips to show in empty state */
  examplePrompts?: Array<{ label: string; prompt: string }>
  /** Context hint prepended to AI prompt — tells the AI what the query is for.
   *  For condition splits, this should explain that the query identifies who goes down the TRUE branch.
   *  For audiences, this can describe the enrollment context. */
  contextHint?: string
}

// ── Component ───────────────────────────────────────────────────────────────
function AiQueryChat({
  onSqlChange,
  onExplanationChange,
  onCountChange,
  initialSql,
  initialPrompt = '',
  initialExplanation,
  initialChatHistory,
  disabled = false,
  compact = false,
  placeholder,
  examplePrompts,
  contextHint,
}: AiQueryChatProps) {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(initialChatHistory ?? [])
  const [prompt, setPrompt] = useState(initialPrompt)
  const [generating, setGenerating] = useState(false)
  const [currentSql, setCurrentSql] = useState<string | null>(initialSql ?? null)
  const [showSqlMap, setShowSqlMap] = useState<Record<number, boolean>>({})
  const [sqlEditorOpen, setSqlEditorOpen] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when chat history changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, generating])

  // ─── AI generation handler ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim() || generating || disabled) return
    setGenerating(true)

    const userMessage: ChatMessage = { role: 'user', content: prompt }
    setChatHistory(prev => [...prev, userMessage])

    // Build conversation history for the edge function
    const conversationHistory = chatHistory.map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? (m.explanation || m.content) + (m.sql ? `\n\nGenerated SQL:\n${m.sql}` : '')
        : m.content
    }))
    conversationHistory.push({ role: 'user', content: prompt })

    setPrompt('')

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-audience-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            prompt: contextHint ? `[CONTEXT: ${contextHint}]\n\n${prompt}` : prompt,
            currentSql: currentSql || undefined,
            conversationHistory,
          }),
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        const errMsg: ChatMessage = {
          role: 'assistant',
          content: `Failed to generate query: ${errText}`,
          error: errText,
        }
        setChatHistory(prev => [...prev, errMsg])
      } else {
        const result = await res.json()
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
          onSqlChange(result.sql)
          if (result.explanation && onExplanationChange) {
            onExplanationChange(result.explanation)
          }
          if (result.estimatedCount != null && onCountChange) {
            onCountChange(result.estimatedCount)
          }
        }
      }
    } catch (err: any) {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: `Error: ${err.message}`,
        error: err.message,
      }
      setChatHistory(prev => [...prev, errMsg])
    }

    setGenerating(false)
  }

  // Toggle SQL visibility per message
  const toggleSql = (index: number) => {
    setShowSqlMap(prev => ({ ...prev, [index]: !prev[index] }))
  }

  // Resolve placeholder text
  const resolvedPlaceholder = placeholder
    ?? (currentSql
      ? 'Refine your query… (e.g. "also exclude anyone who got an email last week")'
      : 'Describe your audience in plain English…')

  const chips = examplePrompts ?? DEFAULT_EXAMPLE_PROMPTS

  return (
    <div className={`aiqc-root${compact ? ' aiqc-compact' : ''}`}>
      {/* Chat Messages */}
      <div className="ai-chat-container">
        <div className="ai-chat-messages">
          {chatHistory.length === 0 && (
            <div className="ai-welcome">
              <div className="ai-welcome-icon">✨</div>
              <h3>Describe your audience</h3>
              <p>Tell me who you want to reach in plain English. I&apos;ll generate the query for you.</p>
              <div className="ai-examples">
                {chips.map((ex, i) => (
                  <button
                    key={i}
                    className="ai-example-chip"
                    onClick={() => setPrompt(ex.prompt)}
                    disabled={disabled}
                  >
                    {ex.label}
                  </button>
                ))}
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
                      onClick={() => toggleSql(i)}
                    >
                      {showSqlMap[i] ? '▾ Hide SQL' : '▸ Show SQL'}
                    </button>
                    {showSqlMap[i] && (
                      <pre className="chat-sql-code">{formatSql(msg.sql)}</pre>
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

          {generating && (
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
              placeholder={resolvedPlaceholder}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
              rows={2}
              disabled={generating || disabled}
            />
            <button
              className="ai-send-btn"
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || disabled}
            >
              {generating ? '⏳' : '➤'}
            </button>
          </div>
          {currentSql && (
            <p className="ai-chat-hint">
              💡 You can refine the query by describing what to change. Press Enter to send.
            </p>
          )}
        </div>
      </div>

      {/* SQL Editor */}
      {currentSql && (
        <div className="aiqc-sql-editor-section">
          <button
            className="aiqc-sql-editor-toggle"
            onClick={() => setSqlEditorOpen(o => !o)}
            disabled={disabled}
          >
            {sqlEditorOpen ? '▾ ✏️ Edit SQL' : '▸ ✏️ Edit SQL'}
          </button>
          {sqlEditorOpen && (
            <div className="aiqc-sql-editor-wrap">
              <label className="aiqc-sql-editor-label">SQL Query — edit directly or regenerate with AI</label>
              <textarea
                className="aiqc-sql-editor"
                value={currentSql}
                onChange={e => {
                  setCurrentSql(e.target.value)
                  onSqlChange(e.target.value)
                }}
                rows={8}
                disabled={disabled}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Scoped styles */}
      <style jsx>{`
        .aiqc-root { width: 100%; }

        /* ─── AI Chat Container ─── */
        .ai-chat-container { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fafafa; }
        .ai-chat-messages { padding: 20px; min-height: 200px; max-height: 480px; overflow-y: auto; }

        .aiqc-compact .ai-chat-messages { max-height: 280px; padding: 14px; }
        .aiqc-compact .ai-welcome h3 { font-size: 1rem; }
        .aiqc-compact .ai-welcome { padding: 16px 12px; }
        .aiqc-compact .ai-chat-input-area { padding: 10px 12px; }

        /* ─── Welcome / Empty State ─── */
        .ai-welcome { text-align: center; padding: 24px 16px; }
        .ai-welcome-icon { font-size: 2.5rem; margin-bottom: 8px; }
        .ai-welcome h3 { font-size: 1.1rem; font-weight: 700; color: #1a2e1a; margin: 0 0 6px; }
        .ai-welcome p { color: #6b7280; font-size: 0.9rem; margin: 0 0 16px; }
        .ai-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .ai-example-chip { background: white; border: 1px solid #e5e7eb; border-radius: 20px; padding: 8px 16px; font-size: 0.82rem; color: #374151; cursor: pointer; transition: all 0.15s; }
        .ai-example-chip:hover { border-color: #a78bfa; background: #faf5ff; color: #6d28d9; }
        .ai-example-chip:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ─── Chat Messages ─── */
        .chat-message { margin-bottom: 16px; display: flex; }
        .chat-message.user { justify-content: flex-end; }
        .chat-message.assistant { justify-content: flex-start; }
        .chat-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 0.9rem; line-height: 1.5; }
        .chat-message.user .chat-bubble { background: #22c55e; color: white; border-bottom-right-radius: 4px; }
        .chat-message.assistant .chat-bubble { background: white; color: #374151; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
        .chat-content { white-space: pre-wrap; }
        .chat-error { margin-top: 8px; padding: 8px 12px; background: #fef2f2; border-radius: 6px; color: #991b1b; font-size: 0.82rem; }

        /* ─── SQL Section ─── */
        .chat-sql-section { margin-top: 10px; margin-left: -16px; margin-right: -16px; }
        .chat-sql-toggle { background: none; border: none; color: #7c3aed; font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0; margin-left: 16px; }
        .chat-sql-toggle:hover { text-decoration: underline; }
        .chat-sql-code { background: #1e1e2e; color: #cdd6f4; padding: 14px 16px; border-radius: 0 0 12px 12px; font-size: 0.78rem; overflow-x: auto; overflow-y: auto; max-height: 400px; margin-top: 6px; white-space: pre; word-break: normal; font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace; line-height: 1.6; tab-size: 2; }

        /* ─── Count & Samples ─── */
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

        /* ─── Loading Animation ─── */
        .chat-loading { display: flex; align-items: center; gap: 4px; }
        .loading-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; animation: dotPulse 1.2s infinite ease-in-out; }
        .loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }

        /* ─── Input Area ─── */
        .ai-chat-input-area { border-top: 1px solid #e5e7eb; padding: 12px 16px; background: white; }
        .ai-chat-input-row { display: flex; gap: 8px; align-items: flex-end; }
        .ai-chat-input { flex: 1; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; resize: none; outline: none; font-family: inherit; line-height: 1.4; }
        .ai-chat-input:focus { border-color: #a78bfa; box-shadow: 0 0 0 3px rgba(167,139,250,0.15); }
        .ai-chat-input:disabled { background: #f9fafb; color: #9ca3af; }
        .ai-send-btn { width: 42px; height: 42px; border-radius: 10px; border: none; background: #7c3aed; color: white; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
        .ai-send-btn:hover:not(:disabled) { background: #6d28d9; }
        .ai-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ai-chat-hint { font-size: 0.78rem; color: #9ca3af; margin: 6px 0 0; }

        /* ─── SQL Editor ─── */
        .aiqc-sql-editor-section { margin-top: 12px; }
        .aiqc-sql-editor-toggle { background: none; border: none; color: #7c3aed; font-size: 0.85rem; font-weight: 600; cursor: pointer; padding: 4px 0; }
        .aiqc-sql-editor-toggle:hover { text-decoration: underline; }
        .aiqc-sql-editor-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
        .aiqc-sql-editor-wrap { margin-top: 8px; }
        .aiqc-sql-editor-label { display: block; font-size: 0.78rem; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
        .aiqc-sql-editor {
          width: 100%;
          background: #1e1e2e;
          color: #cdd6f4;
          border: 1px solid #313244;
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 0.82rem;
          font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          tab-size: 2;
        }
        .aiqc-sql-editor:focus { border-color: #a78bfa; box-shadow: 0 0 0 3px rgba(167,139,250,0.15); }
        .aiqc-sql-editor:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}

export default AiQueryChat
