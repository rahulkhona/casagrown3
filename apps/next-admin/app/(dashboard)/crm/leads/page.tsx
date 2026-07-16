'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
)

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source_platform: string | null
  utm_campaign: string | null
  utm_content: string | null
  accepts_email: boolean
  accepts_sms: boolean
  status: 'new' | 'contacted' | 'converted' | 'archived'
  notes: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  converted: '#22c55e',
  archived: '#9ca3af',
}

// A "partial" lead has a name but no email AND no phone
const isPartial = (l: Lead) => !l.email && !l.phone

export default function CrmLeadsPage() {
  const [leads, setLeads]             = useState<Lead[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<string>('all')
  const [search, setSearch]           = useState('')
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue]   = useState('')
  const [message, setMessage]         = useState('')
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [deleting, setDeleting]       = useState(false)

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvData, setCsvData] = useState<string[][]>([])
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('crm_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (filter === 'partial') {
      q = q.is('email', null).is('phone', null)
    } else if (filter !== 'all') {
      q = q.eq('status', filter)
    }
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const { data } = await q
    setLeads((data as Lead[]) ?? [])
    setSelected(new Set())
    setLoading(false)
  }, [filter, search])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const toast = (msg: string, ms = 2500) => { 
    setMessage(msg); 
    if (!msg.startsWith('Error')) setTimeout(() => setMessage(''), ms) 
  }

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('crm_leads').update({ status }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: status as Lead['status'] } : l))
  }

  const saveNotes = async (id: string) => {
    await supabase.from('crm_leads').update({ notes: notesValue }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, notes: notesValue } : l))
    setEditingNotes(null)
    toast('Notes saved')
  }

  /* ---------- CSV Import ---------- */
  const parseCSVLine = (text: string) => {
    let p = '', row: string[] = [''], i = 0, s = !0
    for (let c of text) {
        if ('"' === c) {
            if (s && c === p) row[i] += c;
            s = !s;
        } else if (',' === c && s) c = row[++i] = '';
        else row[i] += c;
        p = c;
    }
    return row.map(r => r.trim().replace(/^"|"$/g, ''))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = (event.target?.result as string) || ''
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
      if (lines.length < 2) {
        toast('CSV must contain headers and at least one row of data.')
        if (fileRef.current) fileRef.current.value = ''
        return
      }
      
      const headers = parseCSVLine(lines[0])
      const data = lines.slice(1).map(parseCSVLine)
      
      const initialMap: Record<string, string> = {}
      headers.forEach(h => {
        const hc = h.toLowerCase()
        if (hc.includes('name')) initialMap[h] = 'name'
        else if (hc.includes('email')) initialMap[h] = 'email'
        else if (hc.includes('phone') || hc.includes('tel')) initialMap[h] = 'phone'
        else if (hc.includes('source') || hc.includes('platform')) initialMap[h] = 'source_platform'
        else if (hc.includes('note')) initialMap[h] = 'notes'
        else if (hc.includes('campaign')) initialMap[h] = 'utm_campaign'
        else if (hc.includes('variant') || hc.includes('content')) initialMap[h] = 'utm_content'
      })
      
      setCsvHeaders(headers)
      setCsvData(data)
      setCsvMapping(initialMap)
      setCsvFile(file)
    }
    reader.readAsText(file)
  }

  const processImport = async () => {
    if (!Object.values(csvMapping).includes('name')) {
      toast('You must map at least one column to "Name (Required)"')
      return
    }

    setImporting(true)
    const payload = csvData.map(row => {
      const record: any = { status: 'new', accepts_email: false, accepts_sms: false }
      csvHeaders.forEach((header, idx) => {
        const dbField = csvMapping[header]
        if (dbField && dbField !== 'ignore' && row[idx]) {
          record[dbField] = row[idx]
        }
      })
      return record
    }).filter(r => r.name && r.name.trim() !== '')

    if (payload.length === 0) {
      toast('No valid records found to import.')
      setImporting(false)
      return
    }

    for (let i = 0; i < payload.length; i += 100) {
      const batch = payload.slice(i, i + 100)
      const { error } = await supabase.from('crm_leads').insert(batch)
      if (error) {
        toast(`Error importing: ${error.message}`)
        setImporting(false)
        return
      }
    }

    toast(`Successfully imported ${payload.length} leads`)
    setImporting(false)
    setCsvFile(null)
    setCsvHeaders([])
    setCsvData([])
    fetchLeads()
    
    if (fileRef.current) fileRef.current.value = ''
  }

  /* ---------- Selection ---------- */
  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const allSelected = leads.length > 0 && selected.size === leads.length
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(leads.map(l => l.id)))

  /* ---------- Delete ---------- */
  const deleteLead = async (id: string) => {
    await supabase.from('crm_leads').delete().eq('id', id)
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
    toast('Lead deleted')
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) return
    setDeleting(true)
    const ids = Array.from(selected)
    await supabase.from('crm_leads').delete().in('id', ids)
    setLeads(prev => prev.filter(l => !ids.includes(l.id)))
    setSelected(new Set())
    toast(`${ids.length} lead(s) deleted`)
    setDeleting(false)
  }

  const deleteAllPartial = async () => {
    const partialIds = leads.filter(isPartial).map(l => l.id)
    if (partialIds.length === 0) { toast('No partial leads found'); return }
    if (!confirm(`Delete all ${partialIds.length} partial leads (name only, no contact info)?`)) return
    setDeleting(true)
    await supabase.from('crm_leads').delete().in('id', partialIds)
    setLeads(prev => prev.filter(l => !partialIds.includes(l.id)))
    setSelected(new Set())
    toast(`${partialIds.length} partial lead(s) deleted`)
    setDeleting(false)
  }

  const partialCount = leads.filter(isPartial).length

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">CRM Leads</h1>
          <p className="crm-subtitle">Contacts from landing pages and Facebook Lead Ads</p>
        </div>
        <div className="crm-stats">
          <span className="crm-stat">{leads.filter(l => l.status === 'new').length} new</span>
          <span className="crm-stat contacted">{leads.filter(l => l.status === 'contacted').length} contacted</span>
          <span className="crm-stat converted">{leads.filter(l => l.status === 'converted').length} converted</span>
          {partialCount > 0 && (
            <span className="crm-stat partial">{partialCount} partial</span>
          )}
          <label className="crm-upload-btn" title="Upload leads from CSV">
            ⬆ Import CSV
            <input type="file" accept=".csv" ref={fileRef} onChange={handleFileUpload} hidden />
          </label>
        </div>
      </div>

      {message && (
        <div className={`crm-toast ${message.startsWith('Error') ? 'error' : 'success'}`}>
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {csvFile && (
        <div className="crm-form-card csv-mapping-card">
          <h2 className="crm-form-title">Map CSV Columns</h2>
          <div className="crm-info-box" style={{ marginBottom: 16 }}>
            Map your CSV headers to the CRM tracking fields. We auto-mapped obvious ones. 
            <strong> 'Name'</strong> is strictly required by the database.
          </div>
          <div className="crm-table-wrap" style={{ marginBottom: 20 }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>CSV Header</th>
                  <th style={{ minWidth: 200 }}>Map to Lead Field</th>
                  <th>First Row Value</th>
                </tr>
              </thead>
              <tbody>
                {csvHeaders.map((header, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{header || `(Column ${idx+1})`}</td>
                    <td>
                      <select 
                        className="crm-select"
                        style={{ width: '100%', borderColor: csvMapping[header] && csvMapping[header] !== 'ignore' ? '#4ade80' : '#d1d5db' }}
                        value={csvMapping[header] || 'ignore'}
                        onChange={e => setCsvMapping(prev => ({ ...prev, [header]: e.target.value }))}
                      >
                        <option value="ignore">-- Ignore --</option>
                        <option value="name">Name (Required)</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="source_platform">Source Platform</option>
                        <option value="notes">Notes</option>
                        <option value="utm_campaign">UTM Campaign</option>
                        <option value="utm_content">UTM Content</option>
                      </select>
                    </td>
                    <td className="crm-muted" style={{ fontStyle: 'italic' }}>
                      {csvData[0]?.[idx]?.slice(0, 40) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="crm-form-actions" style={{ display: 'flex', gap: 12 }}>
            <button className="crm-btn-primary" onClick={processImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${csvData.length} Leads`}
            </button>
            <button className="crm-btn-secondary" onClick={() => { setCsvFile(null); if (fileRef.current) fileRef.current.value = ''; }} disabled={importing}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="crm-toolbar">
        <input
          id="lead-search"
          className="crm-search"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          id="lead-status-filter"
          className="crm-select"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="archived">Archived</option>
          <option value="partial">⚠ Partial (no contact info)</option>
        </select>

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="crm-bulk-bar">
            <span>{selected.size} selected</span>
            <button
              className="crm-btn-danger-sm"
              onClick={deleteSelected}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : `Delete (${selected.size})`}
            </button>
          </div>
        )}
        {partialCount > 0 && selected.size === 0 && (
          <button className="crm-btn-ghost-danger" onClick={deleteAllPartial} disabled={deleting}>
            🗑 Delete all partial ({partialCount})
          </button>
        )}
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  title="Select all"
                />
              </th>
              <th>Name</th>
              <th>Contact</th>
              <th>Source</th>
              <th>UTM Campaign</th>
              <th>A/B Variant</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="crm-empty">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={10} className="crm-empty">No leads found.</td></tr>
            ) : leads.map(lead => (
              <tr
                key={lead.id}
                data-testid={`lead-row-${lead.id}`}
                className={`${selected.has(lead.id) ? 'selected' : ''} ${isPartial(lead) ? 'partial-row' : ''}`}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleSelect(lead.id)}
                  />
                </td>
                <td>
                  <div className="crm-name">{lead.name}</div>
                  {isPartial(lead) && (
                    <span className="crm-badge partial-badge">no contact</span>
                  )}
                </td>
                <td>
                  {lead.email && <div className="crm-contact">{lead.email}</div>}
                  {lead.phone && <div className="crm-contact secondary">{lead.phone}</div>}
                  {!lead.email && !lead.phone && <span className="crm-muted">—</span>}
                  <div className="crm-consent-row">
                    {lead.accepts_email && <span className="consent-chip">✉</span>}
                    {lead.accepts_sms   && <span className="consent-chip">💬</span>}
                  </div>
                </td>
                <td>
                  {lead.source_platform && (
                    <span className="crm-badge source">{lead.source_platform}</span>
                  )}
                </td>
                <td className="crm-muted">{lead.utm_campaign || '—'}</td>
                <td className="crm-muted">{lead.utm_content || '—'}</td>
                <td>
                  <select
                    className="crm-status-select"
                    value={lead.status}
                    style={{ borderColor: STATUS_COLORS[lead.status] }}
                    onChange={e => updateStatus(lead.id, e.target.value)}
                    data-testid={`lead-status-${lead.id}`}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="archived">Archived</option>
                  </select>
                </td>
                <td>
                  {editingNotes === lead.id ? (
                    <div className="crm-notes-edit">
                      <textarea
                        value={notesValue}
                        onChange={e => setNotesValue(e.target.value)}
                        className="crm-notes-input"
                        rows={2}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="crm-btn-sm" onClick={() => saveNotes(lead.id)}>Save</button>
                        <button className="crm-btn-sm secondary" onClick={() => setEditingNotes(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="crm-notes-view"
                      onClick={() => { setEditingNotes(lead.id); setNotesValue(lead.notes ?? '') }}
                    >
                      {lead.notes || <span className="crm-muted">Add note…</span>}
                    </div>
                  )}
                </td>
                <td className="crm-muted">{new Date(lead.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    className="crm-btn-danger-icon"
                    onClick={() => deleteLead(lead.id)}
                    title="Delete lead"
                    data-testid={`lead-delete-${lead.id}`}
                  >🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; }
        .crm-stats { display: flex; gap: 8px; flex-wrap: wrap; }
        .crm-stat { background: #eff6ff; color: #3b82f6; border-radius: 20px; padding: 4px 12px; font-size: 0.85rem; font-weight: 600; }
        .crm-stat.contacted { background: #fffbeb; color: #f59e0b; }
        .crm-stat.converted { background: #f0fdf4; color: #22c55e; }
        .crm-stat.partial { background: #fef3c7; color: #b45309; }
        .crm-toast { display: flex; align-items: center; justify-content: space-between; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-weight: 500; font-size: 0.9rem; }
        .crm-toast.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
        .crm-toast.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .toast-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; opacity: 0.6; padding: 0 0 0 12px; }
        .toast-close:hover { opacity: 1; }
        .crm-toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .crm-search { flex: 1; min-width: 180px; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 14px; font-size: 0.95rem; outline: none; }
        .crm-search:focus { border-color: #4ade80; }
        .crm-select { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 14px; font-size: 0.95rem; background: white; outline: none; }
        .crm-upload-btn { background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 20px; padding: 4px 12px; font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.1s; }
        .crm-upload-btn:hover { background: #f9fafb; }
        .csv-mapping-card { background: white; border: 2px solid #3b82f6; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
        .crm-info-box { background: #eff6ff; color: #1d4ed8; padding: 12px 16px; border-radius: 8px; font-size: 0.85rem; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; color: #1a2e1a; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 8px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 20px; cursor: pointer; }
        .crm-bulk-bar { display: flex; align-items: center; gap: 10px; background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 12px; font-size: 0.85rem; font-weight: 600; color: #78350f; }
        .crm-btn-ghost-danger { background: none; border: 1px solid #fecaca; color: #ef4444; border-radius: 8px; padding: 8px 14px; font-size: 0.85rem; cursor: pointer; white-space: nowrap; }
        .crm-btn-ghost-danger:hover { background: #fef2f2; }
        .crm-btn-danger-sm { background: #ef4444; color: white; border: none; border-radius: 6px; padding: 5px 12px; font-size: 0.82rem; cursor: pointer; font-weight: 600; }
        .crm-btn-danger-sm:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; }
        .crm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .crm-table th { background: #f9fafb; padding: 10px 14px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .crm-table tr:last-child td { border-bottom: none; }
        .crm-table tr.selected td { background: #f0fdf4; }
        .crm-table tr.partial-row td { background: #fffbeb; }
        .crm-name { font-weight: 600; color: #1a2e1a; }
        .crm-contact { font-size: 0.85rem; color: #374151; }
        .crm-contact.secondary { color: #9ca3af; }
        .crm-consent-row { display: flex; gap: 4px; margin-top: 4px; }
        .consent-chip { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 1px 5px; font-size: 0.75rem; }
        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 500; display: inline-block; }
        .crm-badge.source { background: #e0f2fe; color: #0369a1; }
        .crm-badge.partial-badge { background: #fef3c7; color: #92400e; font-size: 0.72rem; padding: 1px 7px; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; }
        .crm-status-select { border: 1px solid; border-radius: 8px; padding: 4px 8px; font-size: 0.85rem; font-weight: 500; background: white; cursor: pointer; }
        .crm-notes-view { cursor: pointer; color: #374151; font-size: 0.85rem; min-width: 120px; padding: 4px; border-radius: 4px; transition: background 0.1s; }
        .crm-notes-view:hover { background: #f9fafb; }
        .crm-notes-edit { display: flex; flex-direction: column; gap: 6px; }
        .crm-notes-input { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; font-size: 0.85rem; width: 180px; resize: vertical; }
        .crm-btn-sm { border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; background: white; }
        .crm-btn-sm:hover { background: #f9fafb; }
        .crm-btn-sm.secondary { color: #6b7280; }
        .crm-btn-danger-icon { background: none; border: none; cursor: pointer; font-size: 1rem; opacity: 0.4; transition: opacity 0.15s; padding: 4px; }
        .crm-btn-danger-icon:hover { opacity: 1; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; }
      `}</style>
    </div>
  )
}
