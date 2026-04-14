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

      // 1. Try to get the user's state from their profile
      const { data: { session } } = await supabase.auth.getSession()
      let stateId: string | null = null
      let stateName: string | null = null

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('state_code')
          .eq('id', session.user.id)
          .single()

        if (profile?.state_code) {
          const { data: stateRow } = await supabase
            .from('states')
            .select('id, name')
            .eq('code', profile.state_code)
            .single()

          if (stateRow) {
            stateId = stateRow.id
            stateName = stateRow.name
            setUserState(stateName)
          }
        }
      }

      // 2. Fetch quarantines
      if (stateId && !showAll) {
        // Two queries: user's state + national (no state_id)
        const [stateRes, nationalRes] = await Promise.all([
          supabase.from('quarantine_zones').select(selectCols)
            .eq('is_active', true).eq('state_id', stateId)
            .order('starts_at', { ascending: false }),
          supabase.from('quarantine_zones').select(selectCols)
            .eq('is_active', true).is('state_id', null)
            .order('starts_at', { ascending: false }),
        ])
        const combined = [...(stateRes.data || []), ...(nationalRes.data || [])]
        combined.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        setQuarantines(combined)
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {quarantines.map((q) => {
            const county = Array.isArray(q.counties) ? q.counties[0]?.name : q.counties?.name
            const state = Array.isArray(q.states) ? q.states[0]?.name : q.states?.name
            const location = [county ? county + ' County' : '', state].filter(Boolean).join(', ') || 'National'

            return (
              <div key={q.id} style={{ 
                background: '#fff', border: '1px solid #fee2e2', borderRadius: 16, padding: 20,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
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
                    <div style={{ fontSize: 14, color: '#4b5563', marginBottom: 8 }}>
                      <strong>Category:</strong> <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>{q.category}</span>
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
          })}
        </div>
      )}
    </div>
  )
}
