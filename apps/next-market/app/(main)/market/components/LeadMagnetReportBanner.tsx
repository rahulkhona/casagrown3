'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export interface LeadReportData {
  type: 'sell' | 'nutrition'
  email?: string
  name?: string
  zipcode?: string
  status?: 'ready' | 'queued'
  ai_estimate_result?: {
    estimated_annual_earnings: number | string
    reasoning: string
    excess_produce: string
    analogies?: string[]
  }
  selected_plants?: string[]
  selected_trees?: string[]
  ai_nutrition_result?: {
    summary: string
    items: Array<{
      name: string
      time_to_shelf: string
      nutrient_loss_pct: string
      impacted_nutrients?: string
      evidence_link?: string
    }>
  }
  selected_produce?: string[]
}

export default function LeadMagnetReportBanner() {
  const searchParams = useSearchParams()
  const [reportData, setReportData] = useState<LeadReportData | null>(null)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [isDismissed, setIsDismissed] = useState<boolean>(false)

  useEffect(() => {
    // Check if dismissed in this session
    try {
      if (sessionStorage.getItem('casagrown_report_banner_dismissed') === 'true') {
        setIsDismissed(true)
        return
      }
    } catch {}

    const fromParam = searchParams.get('from')
    const zipParam = searchParams.get('zipcode')
    const statusParam = searchParams.get('status')

    let storedReport: LeadReportData | null = null
    try {
      const raw = sessionStorage.getItem('casagrown_lead_report')
      if (raw) {
        storedReport = JSON.parse(raw)
      }
    } catch {}

    if (storedReport) {
      setReportData(storedReport)
    } else if (fromParam === 'sell_report' || fromParam === 'nutrition_report') {
      // Fallback from query params if sessionStorage was empty
      const isSell = fromParam === 'sell_report'
      setReportData({
        type: isSell ? 'sell' : 'nutrition',
        zipcode: zipParam || undefined,
        status: statusParam === 'queued' ? 'queued' : 'ready'
      })
    }
  }, [searchParams])

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      sessionStorage.setItem('casagrown_report_banner_dismissed', 'true')
    } catch {}
  }

  if (isDismissed || !reportData) {
    return null
  }

  const isSell = reportData.type === 'sell'
  const isQueued = reportData.status === 'queued' || (!reportData.ai_estimate_result && !reportData.ai_nutrition_result && searchParams.get('status') === 'queued')
  const email = reportData.email || 'your email'
  const zipcode = reportData.zipcode || searchParams.get('zipcode') || 'your area'

  const sellResult = reportData.ai_estimate_result
  const nutritionResult = reportData.ai_nutrition_result

  return (
    <div
      id="lead-magnet-report-banner"
      style={{
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto 16px auto',
        padding: '0 16px',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #0f2e1b 0%, #14532d 100%)',
          color: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Top Header / Collapsed Teaser Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
            <span style={{ fontSize: '1.4rem' }}>
              {isQueued ? '📬' : isSell ? '🌿' : '🥬'}
            </span>
            <div style={{ fontSize: '0.92rem', lineHeight: 1.4 }}>
              {isQueued ? (
                <>
                  <strong style={{ color: '#4ade80' }}>Your Report is On Its Way!</strong> We're compiling your personalized analysis and emailing it to <span style={{ textDecoration: 'underline' }}>{email}</span>.
                </>
              ) : isSell ? (
                <>
                  <strong style={{ color: '#4ade80' }}>
                    {sellResult?.estimated_annual_earnings
                      ? `Your Backyard Potential: ~$${sellResult.estimated_annual_earnings}/yr!`
                      : 'Your Backyard Potential Report is Ready!'}
                  </strong>{' '}
                  <span style={{ opacity: 0.85 }}>Full report emailed to {email}.</span>
                </>
              ) : (
                <>
                  <strong style={{ color: '#4ade80' }}>Nutrient Loss Alert:</strong>{' '}
                  <span style={{ opacity: 0.85 }}>Up to 50% lost in transit. Full report emailed to {email}.</span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isQueued && (
              <button
                type="button"
                id="toggle-report-breakdown-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                  background: isExpanded ? 'rgba(255,255,255,0.2)' : 'rgba(74, 222, 128, 0.2)',
                  color: isExpanded ? '#ffffff' : '#86efac',
                  border: '1px solid rgba(74, 222, 128, 0.4)',
                  padding: '6px 14px',
                  borderRadius: '100px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>{isExpanded ? 'Hide Breakdown' : 'View Breakdown'}</span>
                <span>{isExpanded ? '▴' : '▾'}</span>
              </button>
            )}

            <button
              type="button"
              id="dismiss-report-banner-btn"
              onClick={handleDismiss}
              aria-label="Dismiss report banner"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '8px',
                lineHeight: 1,
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Expanded Report Breakdown Panel */}
        {isExpanded && !isQueued && (
          <div
            id="expanded-report-breakdown"
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: '20px 20px',
              animation: 'fadeIn 0.3s ease-out',
            }}
          >
            {/* SELLER REPORT VIEW */}
            {isSell && sellResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Earnings Highlight Box */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#86efac' }}>
                    Estimated Annual Backyard Value
                  </span>
                  <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#4ade80', margin: '4px 0 8px 0', lineHeight: 1 }}>
                    ${sellResult.estimated_annual_earnings}
                  </div>
                  {sellResult.reasoning && (
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', margin: 0, maxWidth: '600px', lineHeight: 1.4, fontStyle: 'italic' }}>
                      "{sellResult.reasoning}"
                    </p>
                  )}
                </div>

                {/* Projected Surplus Yield */}
                {sellResult.excess_produce && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#86efac', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🍅</span> Projected Harvest Yield:
                    </div>
                    <div style={{ fontSize: '0.92rem', color: '#ffffff', fontWeight: 600 }}>
                      {sellResult.excess_produce}
                    </div>
                  </div>
                )}

                {/* Analogies List */}
                {sellResult.analogies && sellResult.analogies.length > 0 && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#86efac', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🎯</span> What this extra cash pays for:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.88rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                      {sellResult.analogies.map((analogy, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{analogy}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* BUYER NUTRITION REPORT VIEW */}
            {!isSell && nutritionResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Summary Card */}
                {nutritionResult.summary && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(74, 222, 128, 0.25)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#86efac', marginBottom: '4px' }}>
                      Supply Chain Analysis
                    </div>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.45 }}>
                      {nutritionResult.summary}
                    </p>
                  </div>
                )}

                {/* Degradation Breakdown Table */}
                {nutritionResult.items && nutritionResult.items.length > 0 && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.06)', color: '#86efac', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ padding: '10px 14px' }}>Item</th>
                          <th style={{ padding: '10px 14px' }}>Est. Nutrient Loss</th>
                          <th style={{ padding: '10px 14px' }}>Transit Time</th>
                          <th style={{ padding: '10px 14px' }}>Impacted Nutrients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nutritionResult.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < nutritionResult.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, textTransform: 'capitalize', color: '#ffffff' }}>{item.name}</td>
                            <td style={{ padding: '10px 14px', color: '#f87171', fontWeight: 800 }}>{item.nutrient_loss_pct}</td>
                            <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.75)' }}>{item.time_to_shelf}</td>
                            <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>{item.impacted_nutrients || 'Vitamins & Antioxidants'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Footer Action */}
            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '0.84rem', color: '#86efac', fontWeight: 600 }}>
                {isSell
                  ? `👇 See what neighbors in ${zipcode} are growing and requesting right below!`
                  : `👇 Browse fresh backyard harvests picked today near ${zipcode} below!`}
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '6px 14px',
                  borderRadius: '100px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Collapse & Browse Market ↑
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
