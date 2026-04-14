'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase'

export default function QuarantineInfoPage() {
  const [quarantines, setQuarantines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userState, setUserState] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const selectCols = 'id, category, pest_name, produce_categories, keywords, starts_at, ends_at, source_url, reason, created_by_admin, state_id, counties(name), states(name)'

      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user && !showAll) {
        // Use RPC: resolves zip → county → state and returns only relevant quarantines
        const { data, error } = await supabase.rpc('get_quarantines_for_user', { p_user_id: session.user.id })
        if (data && data.length > 0) {
          // Extract the user's state from the first result that has one
          const firstState = data.find((q: any) => q.state_name)?.state_name
          if (firstState) setUserState(firstState)
          setQuarantines(data)
        } else if (!error) {
          // RPC succeeded but no quarantines found — try to get state name for the empty message
          const { data: profile } = await supabase.from('profiles').select('state_code').eq('id', session.user.id).single()
          if (profile?.state_code) {
            const { data: stateRow } = await supabase.from('states').select('name').eq('code', profile.state_code).single()
            if (stateRow) setUserState(stateRow.name)
          }
          setQuarantines([])
        } else {
          // RPC failed — fall back to showing all
          const { data: allData } = await supabase.from('quarantine_zones').select(selectCols)
            .eq('is_active', true).order('starts_at', { ascending: false })
          if (allData) setQuarantines(allData)
        }
      } else {
        // Guest or "show all" — fetch everything
        const { data } = await supabase.from('quarantine_zones').select(selectCols)
          .eq('is_active', true)
          .order('starts_at', { ascending: false })
        if (data) setQuarantines(data)
      }
      setLoading(false)
    }
    fetchData()
  }, [showAll])

  return (
    <div className="container" style={{ padding: '60px 20px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, color: '#1f2937' }}>Agricultural Quarantines</h1>
        <p style={{ color: '#6b7280', fontSize: 16, margin: 0 }}>
          {userState
            ? `Active pest quarantines affecting ${userState} that may restrict produce sales.`
            : 'Protecting our local agriculture. Listed below are active pest quarantines that prevent the sale or movement of specific homegrown produce.'}
        </p>
        {userState && (
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              marginTop: 12, background: 'none', border: '1px solid #d1d5db',
              padding: '6px 16px', borderRadius: 8, fontSize: 13, color: '#6b7280',
              cursor: 'pointer'
            }}
          >
            {showAll ? `Show only ${userState}` : 'Show all states'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading active quarantines...</div>
      ) : quarantines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: '#f9fafb', borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <h3 style={{ margin: 0, color: '#4b5563' }}>No Active Quarantines</h3>
          <p style={{ margin: '8px 0 0', color: '#9ca3af', fontSize: 14 }}>
            {userState
              ? `There are currently no active agricultural pest quarantines affecting ${userState}.`
              : 'There are currently no active agricultural pest quarantines in the system.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(() => {
            // Group quarantines by pest_name + scope to merge category duplicates
            const grouped = new Map<string, any>()
            for (const q of quarantines) {
              const county = q.county_name || (Array.isArray(q.counties) ? q.counties[0]?.name : q.counties?.name)
              const state = q.state_name || (Array.isArray(q.states) ? q.states[0]?.name : q.states?.name)
              const scope = q.scope || (county ? 'county' : state ? 'state' : 'national')
              const key = `${q.pest_name}::${scope}::${county || ''}::${state || ''}`
              if (!grouped.has(key)) {
                grouped.set(key, { ...q, categories: [q.category], county, state, scope })
              } else {
                const existing = grouped.get(key)!
                if (q.category && !existing.categories.includes(q.category)) {
                  existing.categories.push(q.category)
                }
                if (q.produce_categories) {
                  existing.produce_categories = Array.from(new Set([...(existing.produce_categories || []), ...q.produce_categories]))
                }
                if (q.keywords) {
                  existing.keywords = Array.from(new Set([...(existing.keywords || []), ...q.keywords]))
                }
              }
            }

            const items = Array.from(grouped.values())
            const scopeOrder = ['county', 'state', 'national']
            const scopeConfig: Record<string, { label: string; emoji: string; bg: string; color: string }> = {
              county: {
                label: (items.find(i => i.scope === 'county')?.county || 'Your County') + ' County',
                emoji: '📍', bg: '#fef2f2', color: '#991b1b'
              },
              state: {
                label: items.find(i => i.scope === 'state')?.state || userState || 'Statewide',
                emoji: '🏛️', bg: '#fffbeb', color: '#92400e'
              },
              national: {
                label: 'National (USDA APHIS)',
                emoji: '🇺🇸', bg: '#f0f9ff', color: '#1e40af'
              },
            }

            const elements: React.ReactNode[] = []
            let sectionIndex = 0

            for (const scope of scopeOrder) {
              const sectionItems = items.filter(i => i.scope === scope)
              if (sectionItems.length === 0) continue

              const cfg = scopeConfig[scope]

              if (sectionIndex > 0) {
                elements.push(<div key={`spacer-${scope}`} style={{ height: 8 }} />)
              }

              elements.push(
                <div key={`header-${scope}`} style={{
                  padding: '10px 16px',
                  background: cfg.bg,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  color: cfg.color,
                }}>
                  {cfg.emoji} {cfg.label} — {sectionItems.length} quarantine{sectionItems.length !== 1 ? 's' : ''}
                </div>
              )

              for (let i = 0; i < sectionItems.length; i++) {
                const q = sectionItems[i]
                const location = [q.county ? q.county + ' County' : '', q.state].filter(Boolean).join(', ') || 'National'
                elements.push(
                  <div key={`${scope}-${i}`} style={{
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20,
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {q.pest_name}
                          {q.created_by_admin && (
                            <span style={{ fontSize: 10, background: '#ffedd5', color: '#9a3412', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                              Emergency Block
                            </span>
                          )}
                        </h3>
                        <div style={{ fontSize: 14, color: '#4b5563', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <strong>Categories:</strong>
                          {q.categories.map((cat: string) => (
                            <span key={cat} style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>{cat}</span>
                          ))}
                        </div>
                        {q.produce_categories && q.produce_categories.length > 0 && (
                          <div style={{ fontSize: 14, color: '#4b5563', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            <strong>Affected Items:</strong>
                            {q.produce_categories.map((pc: string) => (
                              <span key={pc} style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 4, fontWeight: 500, fontSize: 13 }}>{pc}</span>
                            ))}
                          </div>
                        )}
                        {q.keywords && q.keywords.length > 0 && (
                          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            {q.keywords.map((kw: string) => (
                              <span key={kw} style={{ background: '#f3f4f6', color: '#4b5563', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>#{kw}</span>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 14, color: '#6b7280' }}>
                          📍 <strong>Affected Area:</strong> {location}
                        </div>
                      </div>
                      {q.source_url && (
                        <a href={q.source_url} target="_blank" rel="noopener noreferrer" style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                          color: '#2563eb', background: '#eff6ff', padding: '8px 14px', borderRadius: 8, textDecoration: 'none'
                        }}>
                          Official Circular ↗
                        </a>
                      )}
                    </div>
                    {q.reason && (
                      <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 13, color: '#4b5563', fontStyle: 'italic' }}>
                        {q.reason}
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
                      Enforced starting {new Date(q.starts_at).toLocaleDateString()}
                      {q.ends_at && ` until ${new Date(q.ends_at).toLocaleDateString()}`}
                    </div>
                  </div>
                )
              }
              sectionIndex++
            }
            return elements
          })()}
        </div>
      )}
    </div>
  )
}
