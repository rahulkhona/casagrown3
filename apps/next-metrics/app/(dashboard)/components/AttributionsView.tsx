'use client'

import React, { useEffect, useState } from 'react'
import { fetchAttributions, type UnifiedAttributionsData } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { formatNumber } from '../../../lib/charts'

export function AttributionsView() {
  const { dateRange, utmFilter } = useFilters()
  const [data, setData] = useState<UnifiedAttributionsData | null>(null)
  const [loading, setLoading] = useState(true)

  // Combination Filters (Full UTMs, Landing Pages & Wizards Combined, Aggregated User Referrals)
  const [selectedSource, setSelectedSource] = useState('all')
  const [selectedMedium, setSelectedMedium] = useState('all')
  const [selectedCampaign, setSelectedCampaign] = useState('all')
  const [selectedTerm, setSelectedTerm] = useState('all')
  const [selectedContent, setSelectedContent] = useState('all')
  const [selectedPageOrWizard, setSelectedPageOrWizard] = useState('all')
  const [selectedReferrer, setSelectedReferrer] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchAttributions(dateRange, utmFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [dateRange, utmFilter])

  if (loading || !data) {
    return (
      <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="page-header">
          <h1 className="page-title">Attributions</h1>
          <p className="page-subtitle">Multi-filter lead and account attribution analysis</p>
        </div>
        <div className="loading-container">
          <div className="spinner" />
          <span>Loading lead & account attribution...</span>
        </div>
      </div>
    )
  }

  // Filter records based on selected combination of filters
  // RULE: User Referrals cannot be intersected with paid ad UTM parameters
  const filteredRecords = data.records.filter(r => {
    // 1. If a specific User Referral channel is selected, evaluate User Referrals independently of paid UTMs
    if (selectedReferrer !== 'all') {
      if (r.referrer !== selectedReferrer) return false
      if (selectedPageOrWizard !== 'all' && r.landingPageOrWizard !== selectedPageOrWizard) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return r.email.toLowerCase().includes(q) ||
               r.landingPageOrWizard.toLowerCase().includes(q) ||
               r.referrer.toLowerCase().includes(q)
      }
      return true
    }

    // 2. Standard paid UTM & Landing Page/Wizard intersection logic when User Referrals is 'all'
    if (selectedSource !== 'all' && r.utmSource !== selectedSource) return false
    if (selectedMedium !== 'all' && r.utmMedium !== selectedMedium) return false
    if (selectedCampaign !== 'all' && r.utmCampaign !== selectedCampaign) return false
    if (selectedTerm !== 'all' && r.utmTerm !== selectedTerm) return false
    if (selectedContent !== 'all' && r.utmContent !== selectedContent) return false
    if (selectedPageOrWizard !== 'all' && r.landingPageOrWizard !== selectedPageOrWizard) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return r.email.toLowerCase().includes(q) ||
             r.utmSource.toLowerCase().includes(q) ||
             r.utmCampaign.toLowerCase().includes(q) ||
             r.landingPageOrWizard.toLowerCase().includes(q) ||
             r.referrer.toLowerCase().includes(q)
    }
    return true
  })

  const filteredTotalLeads = filteredRecords.length
  const filteredTotalAccounts = filteredRecords.filter(r => r.isAccount).length

  const activeFilterCount = (selectedSource !== 'all' ? 1 : 0) +
    (selectedMedium !== 'all' ? 1 : 0) +
    (selectedCampaign !== 'all' ? 1 : 0) +
    (selectedTerm !== 'all' ? 1 : 0) +
    (selectedContent !== 'all' ? 1 : 0) +
    (selectedPageOrWizard !== 'all' ? 1 : 0) +
    (selectedReferrer !== 'all' ? 1 : 0) +
    (searchQuery ? 1 : 0)

  const resetFilters = () => {
    setSelectedSource('all')
    setSelectedMedium('all')
    setSelectedCampaign('all')
    setSelectedTerm('all')
    setSelectedContent('all')
    setSelectedPageOrWizard('all')
    setSelectedReferrer('all')
    setSearchQuery('')
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Attributions</h1>
          <p className="page-subtitle">Attributed lead & account counts filtered by combinations of full UTM parameters, landing pages/wizards, and independent user referrals</p>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--accent-red)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset {activeFilterCount} Active Filters ✕
          </button>
        )}
      </div>

      {/* 1. COMBINATION FILTER SELECTOR BAR (TOP OF PAGE ABOVE COUNTS) */}
      <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            🎛️ Attribution Filter Controls (Full UTMs, Landing Pages/Wizards, Independent User Referrals)
          </h2>

          <input
            type="text"
            placeholder="Search lead/account, UTM, route..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              width: 260,
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}>
          {/* UTM Source */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              UTM SOURCE
            </label>
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              disabled={selectedReferrer !== 'all'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: selectedReferrer !== 'all' ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
                color: selectedReferrer !== 'all' ? 'var(--text-muted)' : 'var(--text-main)',
                fontSize: '0.85rem',
                opacity: selectedReferrer !== 'all' ? 0.5 : 1,
              }}
            >
              <option value="all">All UTM Sources ({data.filterOptions.sources.length})</option>
              {data.filterOptions.sources.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* UTM Medium */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              UTM MEDIUM
            </label>
            <select
              value={selectedMedium}
              onChange={e => setSelectedMedium(e.target.value)}
              disabled={selectedReferrer !== 'all'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: selectedReferrer !== 'all' ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
                color: selectedReferrer !== 'all' ? 'var(--text-muted)' : 'var(--text-main)',
                fontSize: '0.85rem',
                opacity: selectedReferrer !== 'all' ? 0.5 : 1,
              }}
            >
              <option value="all">All Mediums ({data.filterOptions.mediums.length})</option>
              {data.filterOptions.mediums.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* UTM Campaign */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              UTM CAMPAIGN
            </label>
            <select
              value={selectedCampaign}
              onChange={e => setSelectedCampaign(e.target.value)}
              disabled={selectedReferrer !== 'all'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: selectedReferrer !== 'all' ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
                color: selectedReferrer !== 'all' ? 'var(--text-muted)' : 'var(--text-main)',
                fontSize: '0.85rem',
                opacity: selectedReferrer !== 'all' ? 0.5 : 1,
              }}
            >
              <option value="all">All Campaigns ({data.filterOptions.campaigns.length})</option>
              {data.filterOptions.campaigns.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* UTM Term */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              UTM TERM
            </label>
            <select
              value={selectedTerm}
              onChange={e => setSelectedTerm(e.target.value)}
              disabled={selectedReferrer !== 'all'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: selectedReferrer !== 'all' ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
                color: selectedReferrer !== 'all' ? 'var(--text-muted)' : 'var(--text-main)',
                fontSize: '0.85rem',
                opacity: selectedReferrer !== 'all' ? 0.5 : 1,
              }}
            >
              <option value="all">All Terms ({data.filterOptions.terms.length})</option>
              {data.filterOptions.terms.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* UTM Content */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              UTM CONTENT
            </label>
            <select
              value={selectedContent}
              onChange={e => setSelectedContent(e.target.value)}
              disabled={selectedReferrer !== 'all'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: selectedReferrer !== 'all' ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
                color: selectedReferrer !== 'all' ? 'var(--text-muted)' : 'var(--text-main)',
                fontSize: '0.85rem',
                opacity: selectedReferrer !== 'all' ? 0.5 : 1,
              }}
            >
              <option value="all">All Content Variants ({data.filterOptions.contents.length})</option>
              {data.filterOptions.contents.map(ct => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>

          {/* Combined Landing Page & Wizard Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              LANDING PAGE / WIZARD
            </label>
            <select
              value={selectedPageOrWizard}
              onChange={e => setSelectedPageOrWizard(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Pages & Wizards ({data.filterOptions.landingPagesAndWizards.length})</option>
              {data.filterOptions.landingPagesAndWizards.map(pw => (
                <option key={pw} value={pw}>{pw}</option>
              ))}
            </select>
          </div>

          {/* Aggregated User Referrals Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
              USER REFERRALS (INDEPENDENT)
            </label>
            <select
              value={selectedReferrer}
              onChange={e => setSelectedReferrer(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: selectedReferrer !== 'all' ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                background: selectedReferrer !== 'all' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card)',
                color: selectedReferrer !== 'all' ? 'var(--accent-green)' : 'var(--text-main)',
                fontSize: '0.85rem',
                fontWeight: selectedReferrer !== 'all' ? 600 : 400,
              }}
            >
              <option value="all">All User Referrals ({data.filterOptions.referrers.length})</option>
              {data.filterOptions.referrers.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. EXACTLY 2 ATTRIBUTION KPI COUNT CARDS (BELOW FILTERS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        <div className="kpi-card" style={{ padding: 24 }}>
          <div className="kpi-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em' }}>ATTRIBUTED LEADS COUNT</div>
          <div className="kpi-value" style={{ fontSize: '2.5rem', margin: '8px 0' }}>{formatNumber(filteredTotalLeads)}</div>
          <div className="kpi-sub">Total leads matching selected filter combination</div>
        </div>

        <div className="kpi-card" style={{ padding: 24 }}>
          <div className="kpi-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em' }}>ATTRIBUTED ACCOUNTS COUNT</div>
          <div className="kpi-value" style={{ fontSize: '2.5rem', margin: '8px 0', color: 'var(--accent-green)' }}>{formatNumber(filteredTotalAccounts)}</div>
          <div className="kpi-sub">Registered accounts matching selected filter combination</div>
        </div>
      </div>

      {/* 3. ATTRIBUTION BREAKDOWN DATA TABLE */}
      <div className="card glass">
        <div className="chart-title" style={{ marginBottom: 16 }}>Matching Attribution Records</div>
        <div className="table-scroll">
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Lead / Account Email</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>UTM Source / Medium</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>UTM Campaign</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Landing Page / Wizard</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>User Referral Channel</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Attribution Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                    No attribution records match the selected filter combination
                  </td>
                </tr>
              ) : (
                filteredRecords.map(rec => (
                  <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{rec.email}</td>
                    <td style={{ padding: '12px 16px' }}>{rec.utmSource} / {rec.utmMedium}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{rec.utmCampaign}</td>
                    <td style={{ padding: '12px 16px' }}><span className="code">{rec.landingPageOrWizard}</span></td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{rec.referrer}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${rec.isAccount ? 'badge-green' : 'badge-blue'}`}>
                        {rec.isAccount ? '✅ Account Created' : '📥 Lead Captured'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
