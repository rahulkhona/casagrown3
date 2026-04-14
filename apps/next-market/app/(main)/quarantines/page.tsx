'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase'

export default function QuarantineInfoPage() {
  const [quarantines, setQuarantines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userCounty, setUserCounty] = useState<string | null>(null)
  const [userState, setUserState] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // RPC returns county-level quarantines only
        const { data, error } = await supabase.rpc('get_quarantines_for_user', { p_user_id: session.user.id })
        if (data && data.length > 0) {
          const first = data[0]
          if (first.county_name) setUserCounty(first.county_name)
          if (first.state_name) setUserState(first.state_name)
          setQuarantines(data)
        } else if (!error) {
          // No quarantines — try to get county/state for empty message
          const { data: profile } = await supabase.from('profiles').select('zip_code, zip_plus4, state_code, country_code').eq('id', session.user.id).single()
          if (profile) {
            const zip5 = profile.zip_code || (profile.zip_plus4 ? profile.zip_plus4.substring(0, 5) : null)
            if (zip5) {
              const { data: zipRow } = await supabase.from('zip_codes').select('county_id, counties(name, state_id, states(name))').eq('zip_code', zip5).limit(1).single()
              if (zipRow?.counties) {
                const co = Array.isArray(zipRow.counties) ? zipRow.counties[0] : zipRow.counties
                setUserCounty(co?.name || null)
                const st = Array.isArray(co?.states) ? co.states[0] : co?.states
                setUserState(st?.name || null)
              }
            }
          }
          setQuarantines([])
        } else {
          setQuarantines([])
        }
      } else {
        setQuarantines([])
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const countyLabel = userCounty ? `${userCounty} County` : 'your county'
  const stateLabel = userState || 'your state'

  return (
    <div className="container" style={{ padding: '60px 20px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, color: '#1f2937' }}>Agricultural Quarantines</h1>
        <p style={{ color: '#6b7280', fontSize: 16, margin: 0 }}>
          {userCounty
            ? `Active pest quarantines in ${countyLabel}, ${stateLabel} that restrict homegrown produce sales.`
            : 'Sign in to see quarantines affecting your area.'}
        </p>
        {userCounty && (
          <p style={{ color: '#9ca3af', fontSize: 13, margin: '8px 0 0' }}>
            Quarantines prohibit moving homegrown produce off your property within the designated zone.
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading active quarantines...</div>
      ) : quarantines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: '#f9fafb', borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <h3 style={{ margin: 0, color: '#4b5563' }}>No Active Quarantines</h3>
          <p style={{ margin: '8px 0 0', color: '#9ca3af', fontSize: 14 }}>
            {userCounty
              ? `There are currently no active agricultural quarantines in ${countyLabel}. You can list all produce freely.`
              : 'Sign in to check quarantines for your area.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* County header */}
          <div style={{
            padding: '10px 16px',
            background: '#fef2f2',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            color: '#991b1b',
          }}>
            📍 {countyLabel} — {(() => {
              // Count unique pest names
              const pests = new Set(quarantines.map(q => q.pest_name))
              return `${pests.size} quarantine${pests.size !== 1 ? 's' : ''}`
            })()}
          </div>

          {/* Group quarantines by pest to merge category duplicates */}
          {(() => {
            const grouped = new Map<string, any>()
            for (const q of quarantines) {
              const key = q.pest_name
              if (!grouped.has(key)) {
                grouped.set(key, { ...q, categories: [q.category] })
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

            return Array.from(grouped.values()).map((q, i) => (
              <div key={q.quarantine_id || i} style={{
                background: '#fff', border: '1px solid #fee2e2', borderRadius: 16, padding: 20,
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
                        <strong>Restricted produce:</strong>
                        {q.keywords.map((kw: string) => (
                          <span key={kw} style={{ background: '#f3f4f6', color: '#4b5563', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>#{kw}</span>
                        ))}
                      </div>
                    )}
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
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                  🚫 Homegrown produce in these categories cannot be listed for sale on CasaGrown while this quarantine is active.
                </div>
              </div>
            ))
          })()}
        </div>
      )}
    </div>
  )
}
