'use client'

import { useEffect, useState } from 'react'
import { fetchCrmTrafficAnalysis, type CrmTrafficAnalysisData } from '../../../../lib/metrics-service'
import { useFilters } from '../../layout'

function formatMarkdownLine(text: string) {
  // Escape HTML characters to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Replace bold **text**
  const boldified = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Replace italic *text*
  const italicized = boldified.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Replace inline code `code`
  const coded = italicized.replace(/`(.*?)`/g, '<code style="background: rgba(128,128,128,0.1); padding: 2px 4px; border-radius: 4px; font-family: monospace;">$1</code>');
  
  return <span dangerouslySetInnerHTML={{ __html: coded }} />;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const WIZARDS = [
  { slug: "/create-listing", label: "Listing Creation Wizard" },
  { slug: "/create-listing-simple", label: "Simple Listing Wizard" },
  { slug: "/create-listing-wizard", label: "Standard Listing Wizard" },
  { slug: "/join", label: "Buyer Join Wizard" },
  { slug: "/sell", label: "Seller Setup Wizard" },
  { slug: "/profile-setup", label: "Profile Setup Wizard" },
  { slug: "/check-nutrition-loss", label: "Nutrition Loss Calculator Wizard" },
  { slug: "/p/[slug]", label: "Promotion Onboarding" },
  { slug: "/growbot", label: "Growbot Shared Chat" },
  { slug: "/market/booth/[id]", label: "Booth Shared Page" },
  { slug: "/community", label: "Community Share Path" },
  { slug: "/join-booth", label: "Booth Invitation Link" },
  { slug: "/", label: "Home Page Landing" },
  { slug: "/market", label: "Market Hub Landing" }
]

export default function TrafficAnalysisPage() {
  const { dateRange, utmFilter } = useFilters()
  const [data, setData] = useState<CrmTrafficAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)

  // Wizard selector
  const [selectedWizard, setSelectedWizard] = useState<string>("/create-listing")

  // AI Summary State
  const [summary, setSummary] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)

  // Grid selection state
  const [selectedGrid, setSelectedGrid] = useState<string>('leads')

  useEffect(() => {
    setLoading(true)
    fetchCrmTrafficAnalysis(dateRange, utmFilter, selectedWizard)
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch CRM traffic analysis:", err)
        setLoading(false)
      })
  }, [dateRange, utmFilter, selectedWizard])

  // Aggregate stats
  const totalStarts = data?.funnelWeekday.reduce((s, r) => s + r.starts, 0) || 0
  const totalCompleted = data?.funnelWeekday.reduce((s, r) => s + r.completed, 0) || 0
  const totalDropStep1 = data?.funnelWeekday.reduce((s, r) => s + r.dropStep1, 0) || 0
  const totalDropStep2Plus = data?.funnelWeekday.reduce((s, r) => s + r.dropStep2Plus, 0) || 0
  
  const overallDropRate = totalStarts > 0 ? (((totalStarts - totalCompleted) / totalStarts) * 100).toFixed(1) : '0'
  const step1DropPct = totalStarts > 0 ? ((totalDropStep1 / totalStarts) * 100).toFixed(0) : '0'
  const step2DropPct = totalStarts > 0 ? ((totalDropStep2Plus / totalStarts) * 100).toFixed(0) : '0'

  const totalListings = data?.listingsWeekday.reduce((s, r) => s + r.total, 0) || 0
  const totalSameSession = data?.listingsWeekday.reduce((s, r) => s + r.sameSession, 0) || 0
  const totalSameDay = data?.listingsWeekday.reduce((s, r) => s + r.sameDay, 0) || 0
  const totalLater = data?.listingsWeekday.reduce((s, r) => s + r.later, 0) || 0

  const newSellerRatio = totalListings > 0 ? (((totalSameSession + totalSameDay) / totalListings) * 100).toFixed(0) : '0'

  // Leads to account conversions
  const leadsToAccountStats = data?.leadsToAccountStats || { totalLeads: 0, convertedLeads: 0 }
  const leadsToAccountRate = leadsToAccountStats.totalLeads > 0 
    ? ((leadsToAccountStats.convertedLeads / leadsToAccountStats.totalLeads) * 100).toFixed(1)
    : '0.0'

  const wizardLabel = WIZARDS.find(w => w.slug === selectedWizard)?.label || selectedWizard

  // Build active filter summary text
  const activeFilters = []
  if (utmFilter.utm_source) activeFilters.push(`Source: "${utmFilter.utm_source}"`)
  if (utmFilter.utm_medium) activeFilters.push(`Medium: "${utmFilter.utm_medium}"`)
  if (utmFilter.utm_campaign) activeFilters.push(`Campaign: "${utmFilter.utm_campaign}"`)
  const filterText = activeFilters.length > 0 ? `Filtered by ${activeFilters.join(', ')}` : 'No UTM filters active'

  // AI Summary Invocation
  const handleGenerateSummary = async () => {
    if (!data) return
    setAiLoading(true)
    setSummary('')
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, selectedWizard: wizardLabel }),
      })
      if (!res.ok) throw new Error(await res.text())
      const resData = await res.json()
      setSummary(resData.summary)
    } catch (err: any) {
      console.error(err)
      setSummary(`Error generating summary: ${err.message || String(err)}`)
    } finally {
      setAiLoading(false)
    }
  }

  const handlePrintPdf = () => {
    window.print()
  }

  // Get active grid source
  const getActiveGrid = () => {
    if (!data) return []
    switch (selectedGrid) {
      case 'leads': return data.leadsGrid
      case 'accounts': return data.accountsGrid
      case 'signupPath': return data.signupPathGrid || []
      case 'convertedLeads': return data.leadsToAccountGrid
      case 'listings': return data.listingsGrid
      case 'dropOff_listing': return data.dropOffGrids?.listing || []
      case 'dropOff_join': return data.dropOffGrids?.join || []
      case 'dropOff_sell': return data.dropOffGrids?.sell || []
      case 'dropOff_profileSetup': return data.dropOffGrids?.profileSetup || []
      case 'dropOff_nutrition': return data.dropOffGrids?.nutrition || []
      default: return []
    }
  }

  const activeGridData = getActiveGrid()
  const maxGridVal = activeGridData.length > 0 
    ? Math.max(...activeGridData.flatMap(row => {
        return DAYS_OF_WEEK.map(d => {
          const val = row[d];
          if (typeof val === 'object' && val !== null) {
            if ('total' in val) return val.total || 0
            return (val.step1 || 0) + (val.step2 || 0)
          }
          return Number(val) || 0
        })
      }), 1)
    : 1

  return (
    <div className="container">
      {/* Hide on print except summary report */}
      <div className="no-print">
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 className="page-title">Traffic & Conversion Analysis</h1>
              <p className="page-subtitle">Analyze conversion rates, lead signups, account creations, listing funnels, and drop-offs</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Wizard:</span>
                <select 
                  value={selectedWizard} 
                  onChange={(e) => setSelectedWizard(e.target.value)}
                  className="wizard-select"
                >
                  {WIZARDS.map(w => (
                    <option key={w.slug} value={w.slug}>{w.label}</option>
                  ))}
                </select>
              </div>

              <div className="filter-badge">
                {filterText}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-card">
            <div className="spinner" />
            <p>Loading staging traffic analysis for {wizardLabel}...</p>
          </div>
        ) : (
          <>
            {/* Executive Overview Cards */}
            <div className="grid-cards">
              <div className="metric-card glass">
                <div className="metric-header">
                  <span className="metric-label">Wizard Funnel Stats</span>
                  <span className="metric-icon">🚀</span>
                </div>
                <div className="metric-value">{totalStarts} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>starts</span></div>
                <div className="metric-sub">{totalCompleted} completed wizard funnel</div>
              </div>

              <div className="metric-card glass">
                <div className="metric-header">
                  <span className="metric-label">Wizard Drop-offs</span>
                  <span className="metric-icon">🚨</span>
                </div>
                <div className="metric-value text-danger">{overallDropRate}%</div>
                <div className="metric-sub">{step1DropPct}% Step 1 • {step2DropPct}% Step 2+</div>
              </div>

              <div className="metric-card glass">
                <div className="metric-header">
                  <span className="metric-label">Leads to Account Conversion</span>
                  <span className="metric-icon">🤝</span>
                </div>
                <div className="metric-value text-success">{leadsToAccountRate}%</div>
                <div className="metric-sub">{leadsToAccountStats.convertedLeads} signups from {leadsToAccountStats.totalLeads} leads</div>
              </div>
            </div>

            {/* List Completion Card and initiated listings */}
            <div className="card glass" style={{ marginBottom: 32 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
                <div>
                  <div className="metric-label">Initiated Listings</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>
                    {data?.funnelWeekday.reduce((s, r) => s + r.starts, 0) || 0}
                  </div>
                   <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Seller initiated listing wizard on `{selectedWizard}`
                  </div>
                </div>
                <div>
                  <div className="metric-label">Completed Listings</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: 'var(--accent-green)' }}>
                    {totalListings}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Product added to staging inventory database
                  </div>
                </div>
                <div>
                  <div className="metric-label">Same-Session Completion</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>
                    {newSellerRatio}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Created within 15 minutes of user signup
                  </div>
                </div>
              </div>
            </div>



            {/* AI Summary Section */}
            <div className="card glass ai-summary-card" style={{ marginBottom: 40 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🤖</span> AI Analyst Cohort & PDF Summary
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    onClick={handleGenerateSummary} 
                    disabled={aiLoading}
                    className="btn btn-primary"
                  >
                    {aiLoading ? 'Analyzing...' : 'Ask AI to Summarize'}
                  </button>
                  {summary && (
                    <button 
                      onClick={handlePrintPdf} 
                      className="btn btn-secondary"
                    >
                      🖨️ Download PDF Report
                    </button>
                  )}
                </div>
              </div>

              {aiLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', fontSize: '0.88rem', padding: '12px 0' }}>
                  <div className="spinner-small" />
                  <span>Analyzing drop-offs and leads-to-signup conversion for {wizardLabel}...</span>
                </div>
              )}

              {summary && (
                <div className="markdown-body">
                  {summary.split('\n').map((line, idx) => {
                    if (line.startsWith('###')) {
                      return <h4 key={idx} style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, fontSize: '0.95rem' }}>{formatMarkdownLine(line.replace('###', '').trim())}</h4>
                    }
                    if (line.startsWith('##')) {
                      return <h3 key={idx} style={{ marginTop: 20, marginBottom: 10, fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary)' }}>{formatMarkdownLine(line.replace('##', '').trim())}</h3>
                    }
                    if (line.startsWith('*') || line.startsWith('-')) {
                      return <li key={idx} style={{ marginLeft: 16, marginBottom: 4, fontSize: '0.88rem' }}>{formatMarkdownLine(line.substring(1).trim())}</li>
                    }
                    if (/^\d+\./.test(line)) {
                      return <div key={idx} style={{ marginLeft: 16, marginBottom: 6, fontSize: '0.88rem' }}><strong>{formatMarkdownLine(line)}</strong></div>
                    }
                    return <p key={idx} style={{ marginBottom: 8, fontSize: '0.88rem', lineHeight: 1.5 }}>{formatMarkdownLine(line)}</p>
                  })}
                </div>
              )}
            </div>

            {/* Heatmap Grids: Hours in Rows, Days in Columns */}
            <div className="section-title">📊 Hourly Day-of-Week Cohort Heatmaps</div>
            <div className="card glass" style={{ marginBottom: 40, paddingBottom: 24 }}>
              <div className="grid-tabs-bar" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button className={`tab-btn ${selectedGrid === 'leads' ? 'active' : ''}`} onClick={() => setSelectedGrid('leads')}>Leads</button>
                <button className={`tab-btn ${selectedGrid === 'accounts' ? 'active' : ''}`} onClick={() => setSelectedGrid('accounts')}>Account Creations</button>
                <button className={`tab-btn ${selectedGrid === 'signupPath' ? 'active' : ''}`} onClick={() => setSelectedGrid('signupPath')}>Signup Paths</button>
                <button className={`tab-btn ${selectedGrid === 'convertedLeads' ? 'active' : ''}`} onClick={() => setSelectedGrid('convertedLeads')}>Converted Leads</button>
                <button className={`tab-btn ${selectedGrid === 'listings' ? 'active' : ''}`} onClick={() => setSelectedGrid('listings')}>Listing Creations</button>
                <button className={`tab-btn ${selectedGrid === 'dropOff_listing' ? 'active' : ''}`} onClick={() => setSelectedGrid('dropOff_listing')}>Listing Wizard Drop-offs</button>
                <button className={`tab-btn ${selectedGrid === 'dropOff_join' ? 'active' : ''}`} onClick={() => setSelectedGrid('dropOff_join')}>Buyer Join Drop-offs</button>
                <button className={`tab-btn ${selectedGrid === 'dropOff_sell' ? 'active' : ''}`} onClick={() => setSelectedGrid('dropOff_sell')}>Seller Setup Drop-offs</button>
                <button className={`tab-btn ${selectedGrid === 'dropOff_profileSetup' ? 'active' : ''}`} onClick={() => setSelectedGrid('dropOff_profileSetup')}>Profile Setup Drop-offs</button>
                <button className={`tab-btn ${selectedGrid === 'dropOff_nutrition' ? 'active' : ''}`} onClick={() => setSelectedGrid('dropOff_nutrition')}>Nutrition Calculator Drop-offs</button>
              </div>

              <div className="table-scroll">
                <table className="heatmap-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Hour (Local)</th>
                      {DAYS_OF_WEEK.map(d => (
                        <th key={d} style={{ textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>{d.substring(0, 3)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeGridData.map((row: any) => (
                      <tr key={row.hourStr}>
                        <td className="font-semibold" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{row.hourStr}</td>
                        {DAYS_OF_WEEK.map(d => {
                          const cellVal = row[d]
                          let displayContent: React.ReactNode = "0"
                          let hasValue = false
                          let totalVal = 0
                          
                          if (typeof cellVal === 'object' && cellVal !== null) {
                            if ('total' in cellVal) {
                              totalVal = cellVal.total || 0;
                              hasValue = totalVal > 0;
                              
                              displayContent = (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.68rem', lineHeight: 1.1 }}>
                                  {Object.entries(cellVal)
                                    .filter(([key, val]) => key !== 'total' && typeof val === 'number' && val > 0)
                                    .map(([key, val]) => {
                                      const pct = totalVal > 0 ? Math.round((val as number / totalVal) * 100) : 0;
                                      let shortLabel = key;
                                       if (key === '/create-listing') shortLabel = 'listing';
                                       else if (key === '/create-listing-simple') shortLabel = 'listing-simple';
                                       else if (key === '/create-listing-wizard') shortLabel = 'listing-wizard';
                                       else if (key === '/join') shortLabel = 'join';
                                      else if (key === '/sell') shortLabel = 'sell';
                                      else if (key === '/profile-setup') shortLabel = 'profile';
                                      else if (key === '/check-nutrition-loss') shortLabel = 'nutrition';
                                      else if (key === '/pro') shortLabel = 'pro';
                                      else if (key === '/p/[slug]') shortLabel = 'promo';
                                      else if (key === '/growbot') shortLabel = 'growbot';
                                      else if (key === '/market/booth/[id]') shortLabel = 'booth';
                                      else if (key === '/community') shortLabel = 'community';
                                      else if (key === '/join-booth') shortLabel = 'invite';
                                      else if (key === '/') shortLabel = 'home';
                                      else if (key === '/market') shortLabel = 'market';
                                      
                                      return (
                                        <span key={key} style={{ opacity: 0.95, whiteSpace: 'nowrap' }}>
                                          {shortLabel}: {val as number} ({pct}%)
                                        </span>
                                      );
                                    })
                                  }
                                </div>
                              );
                            } else {
                              totalVal = (cellVal.step1 || 0) + (cellVal.step2 || 0)
                              hasValue = totalVal > 0
                              
                              const startsVal = cellVal.starts || 0
                              const pct1 = startsVal > 0 ? Math.round((cellVal.step1 / startsVal) * 100) : 0
                              const pct2 = startsVal > 0 ? Math.round((cellVal.step2 / startsVal) * 100) : 0

                              displayContent = (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.68rem', lineHeight: 1.1 }}>
                                  {cellVal.step1 > 0 && <span style={{ opacity: 0.95, whiteSpace: 'nowrap' }}>S1: {cellVal.step1} ({pct1}%)</span>}
                                  {cellVal.step2 > 0 && <span style={{ opacity: 0.95, whiteSpace: 'nowrap' }}>S2: {cellVal.step2} ({pct2}%)</span>}
                                </div>
                              )
                            }
                          } else {
                            totalVal = Number(cellVal) || 0
                            hasValue = totalVal > 0
                            displayContent = totalVal
                          }

                          const intensity = totalVal > 0 ? Math.max(0.1, totalVal / maxGridVal) : 0
                          
                          return (
                            <td 
                              key={d} 
                              style={{ 
                                background: hasValue ? `rgba(22, 163, 74, ${intensity * 0.7})` : 'transparent',
                                color: hasValue ? (intensity > 0.6 ? '#fff' : 'var(--text-primary)') : 'rgba(128,128,128,0.15)',
                                fontWeight: hasValue ? 700 : 400,
                                textAlign: 'center',
                                fontSize: typeof cellVal === 'object' ? '0.68rem' : '0.8125rem',
                                transition: 'background 0.2s ease',
                                border: '1px solid var(--border-subtle)',
                                padding: typeof cellVal === 'object' ? '6px 2px' : '8px 4px',
                                minWidth: typeof cellVal === 'object' ? 84 : 64
                              }}
                            >
                              {displayContent}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 1: Day of Week Breakdown */}
            <div className="section-title">📅 Day of the Week Analysis</div>
            <div className="grid-tables">
              {/* Weekday Funnel */}
              <div className="card glass">
                <h2 className="card-title">Wizard Funnel & Drop-offs by Weekday</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Weekday</th>
                      <th>Starts</th>
                      <th>Completed</th>
                      <th>Drop Step 1</th>
                      <th>Drop Step 2+</th>
                      <th>Drop Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.funnelWeekday.map(row => {
                      const dropPct = row.starts > 0 ? (((row.starts - row.completed) / row.starts) * 100).toFixed(0) : '0'
                      return (
                        <tr key={row.weekday}>
                          <td className="font-semibold">{row.weekday}</td>
                          <td>{row.starts}</td>
                          <td className="text-success font-semibold">{row.completed}</td>
                          <td className="text-muted">{row.dropStep1}</td>
                          <td className="text-muted">{row.dropStep2Plus}</td>
                          <td>
                            <span className={`badge ${parseInt(dropPct) > 75 ? 'badge-danger' : 'badge-success'}`}>
                              {dropPct}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Weekday Account Age */}
              <div className="card glass">
                <h2 className="card-title">Listings Created vs. Account Age by Weekday</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Weekday</th>
                      <th>Total Listings</th>
                      <th>{"Same Session (<15m)"}</th>
                      <th>{"Same Day (<24h)"}</th>
                      <th>Later (Existing)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.listingsWeekday.map(row => (
                      <tr key={row.weekday}>
                        <td className="font-semibold">{row.weekday}</td>
                        <td className="font-semibold">{row.total}</td>
                        <td className="text-success">{row.sameSession}</td>
                        <td>{row.sameDay}</td>
                        <td className="text-muted">{row.later}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Hourly Timezone Breakdown */}
            <div className="section-title">🕒 Local Timezone Hourly Analysis</div>
            <div className="grid-tables">
              {/* Hourly Funnel */}
              <div className="card glass">
                <h2 className="card-title">Wizard Funnel & Drop-offs by Local Hour</h2>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Hour</th>
                        <th>Starts</th>
                        <th>Completed</th>
                        <th>Drop Step 1</th>
                        <th>Drop Step 2+</th>
                        <th>Drop Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.funnelHour.map(row => {
                        const dropPct = row.starts > 0 ? (((row.starts - row.completed) / row.starts) * 100).toFixed(0) : '0'
                        return (
                          <tr key={row.hourStr}>
                            <td className="font-semibold">{row.hourStr}</td>
                            <td>{row.starts}</td>
                            <td className="text-success">{row.completed}</td>
                            <td>{row.dropStep1}</td>
                            <td>{row.dropStep2Plus}</td>
                            <td>
                              {row.starts > 0 ? (
                                <span className={`badge ${parseInt(dropPct) > 75 ? 'badge-danger' : 'badge-success'}`}>
                                  {dropPct}%
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hourly Account Age */}
              <div className="card glass">
                <h2 className="card-title">Listings Created vs. Account Age by Local Hour</h2>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Hour</th>
                        <th>Total Listings</th>
                        <th>{"Same Session (<15m)"}</th>
                        <th>{"Same Day (<24h)"}</th>
                        <th>Later (Existing)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.completedListings.map(row => (
                        <tr key={row.hourStr}>
                          <td className="font-semibold">{row.hourStr}</td>
                          <td className="font-semibold">{row.total}</td>
                          <td className="text-success">{row.sameSession}</td>
                          <td>{row.sameDay}</td>
                          <td className="text-muted">{row.later}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Print-only AI Report Layout */}
      {summary && (
        <div className="print-only print-report">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2px solid #16a34a', paddingBottom: 16, marginBottom: 24 }}>
            <span style={{ fontSize: '32px' }}>📊</span>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d', letterSpacing: '-0.025em' }}>CasaGrown Traffic & Conversion Report</h1>
              <p style={{ fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500 }}>AI Generated Executive Summary — Date Range: {dateRange.start} to {dateRange.end} for {wizardLabel}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ border: '1px solid #e5e7eb', padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Wizard Starts ({wizardLabel})</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalStarts}</div>
            </div>
            <div style={{ border: '1px solid #e5e7eb', padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Wizard Drop-off</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{overallDropRate}%</div>
            </div>
            <div style={{ border: '1px solid #e5e7eb', padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Leads-to-Account Rate</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a' }}>{leadsToAccountRate}%</div>
            </div>
          </div>

          <div className="markdown-body">
            {summary.split('\n').map((line, idx) => {
              if (line.startsWith('###')) {
                return <h4 key={idx} style={{ marginTop: 12, marginBottom: 6, fontWeight: 700, fontSize: '0.9rem' }}>{formatMarkdownLine(line.replace('###', '').trim())}</h4>
              }
              if (line.startsWith('##')) {
                return <h3 key={idx} style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, fontSize: '1rem', color: '#15803d', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>{formatMarkdownLine(line.replace('##', '').trim())}</h3>
              }
              if (line.startsWith('*') || line.startsWith('-')) {
                return <li key={idx} style={{ marginLeft: 16, marginBottom: 4, fontSize: '0.8125rem' }}>{formatMarkdownLine(line.substring(1).trim())}</li>
              }
              if (/^\d+\./.test(line)) {
                return <div key={idx} style={{ marginLeft: 16, marginBottom: 4, fontSize: '0.8125rem' }}><strong>{formatMarkdownLine(line)}</strong></div>
              }
              return <p key={idx} style={{ marginBottom: 6, fontSize: '0.8125rem', lineHeight: 1.4 }}>{formatMarkdownLine(line)}</p>
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .container {
          padding-bottom: 60px;
        }
        .page-header {
          margin-bottom: 32px;
        }
        .page-title {
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.025em;
        }
        .page-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-top: 6px;
        }
        .wizard-select {
          background: var(--surface-card);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 600;
          outline: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .wizard-select:hover {
          border-color: #16a34a;
        }
        .filter-badge {
          background: rgba(59,130,246,0.1);
          border: 1px solid rgba(59,130,246,0.2);
          color: #3b82f6;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 0.8125rem;
          font-weight: 600;
        }
        .loading-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
          background: var(--surface-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          color: var(--text-muted);
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(22,163,74,0.15);
          border-top-color: #16a34a;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 16px;
        }
        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(22,163,74,0.15);
          border-top-color: #16a34a;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .grid-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }
        .metric-card {
          padding: 24px;
          border-radius: 20px;
          border: 1px solid var(--border-subtle);
        }
        .glass {
          background: var(--surface-card);
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .glass:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px -2px rgba(0,0,0,0.08);
        }
        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .metric-label {
          color: var(--text-muted);
          font-size: 0.88rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .metric-icon {
          font-size: 1.25rem;
        }
        .metric-value {
          font-size: 2.25rem;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.1;
          margin-bottom: 8px;
        }
        .metric-sub {
          font-size: 0.82rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        .text-danger { color: #ef4444; }
        .text-success { color: #16a34a; }
        .section-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 40px 0 20px 0;
          border-bottom: 2px solid var(--border-subtle);
          padding-bottom: 8px;
        }
        .grid-tables {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
        }
        .card {
          padding: 24px;
          border-radius: 20px;
          border: 1px solid var(--border-subtle);
          overflow: hidden;
        }
        .card-title {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 20px;
          color: var(--text-primary);
        }
        .table-scroll {
          max-height: 480px;
          overflow-y: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
          text-align: left;
        }
        .table th {
          position: sticky;
          top: 0;
          background: var(--surface-card);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.78rem;
          text-transform: uppercase;
          padding: 10px 12px 10px 0;
          border-bottom: 2px solid var(--border-subtle);
        }
        .table td {
          padding: 12px 12px 12px 0;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
        }
        .table tr:last-child td {
          border-bottom: none;
        }
        .font-semibold { font-weight: 600; }
        .text-muted { color: var(--text-muted); }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
        }
        .badge-danger {
          background: rgba(239,68,68,0.1);
          color: #ef4444;
          border: 1px solid rgba(239,68,68,0.2);
        }
        .badge-success {
          background: rgba(34,197,94,0.1);
          color: #16a34a;
          border: 1px solid rgba(34,197,94,0.2);
        }

        /* Buttons */
        .btn {
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }
        .btn-primary {
          background: #16a34a;
          color: white;
        }
        .btn-primary:hover {
          background: #15803d;
        }
        .btn-primary:disabled {
          background: var(--border-subtle);
          color: var(--text-muted);
          cursor: not-allowed;
        }
        .btn-secondary {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.2);
        }
        .btn-secondary:hover {
          background: rgba(59, 130, 246, 0.2);
        }

        /* Tab Buttons */
        .grid-tabs-bar {
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px;
        }
        .tab-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tab-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .tab-btn.active {
          background: #16a34a;
          color: white;
          border-color: #16a34a;
        }

        /* Heatmap Styles */
        .heatmap-table {
          width: 100%;
          border-collapse: collapse;
        }
        .heatmap-table th {
          background: var(--surface-card);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.72rem;
          padding: 10px;
          text-align: center;
          border: 1px solid var(--border-subtle);
        }
        .heatmap-table td {
          padding: 10px;
          height: 38px;
        }

        /* Print styling rules */
        .print-only {
          display: none;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-report {
            padding: 20px;
            background: white !important;
            color: black !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  )
}
