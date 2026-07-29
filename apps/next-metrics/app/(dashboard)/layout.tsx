'use client'

import React, { useState, useEffect, createContext, useContext } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthGuard } from '../auth-guard'
import type { GeoFilter, DateRange, Granularity } from '../../lib/metrics-service'
import { getIsDemoMode } from '../../lib/metrics-service'
import { supabase } from '../../lib/supabase'


// ─── Demo Data Banner ───────────────────────────────────────────────────────

function DemoBanner() {
  const [showBanner, setShowBanner] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check demo mode after data has loaded
    const timer = setInterval(() => {
      if (getIsDemoMode()) {
        setShowBanner(true)
        clearInterval(timer)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [])

  if (!showBanner || dismissed) return null

  return (
    <div id="demo-data-banner" style={{
      background: 'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(239,68,68,0.10))',
      border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>⚠️</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--accent-orange-light)', fontWeight: 500 }}>
          Showing demo data — database RPCs not yet deployed. Deploy the metrics migration to see live data.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '1rem',
          padding: '2px 6px',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ─── Filter Context ─────────────────────────────────────────────────────────

export interface UtmFilter {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

interface FilterState {
  dateRange: DateRange
  granularity: Granularity
  geoFilter: GeoFilter
  utmFilter: UtmFilter
  setDateRange: (r: DateRange) => void
  setGranularity: (g: Granularity) => void
  setGeoFilter: (f: GeoFilter) => void
  setUtmFilter: (f: UtmFilter) => void
}

const defaultDateRange: DateRange = (() => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().split('T')[0]!,
    end: end.toISOString().split('T')[0]!,
  }
})()

const FilterContext = createContext<FilterState>({
  dateRange: defaultDateRange,
  granularity: 'daily',
  geoFilter: {},
  utmFilter: {},
  setDateRange: () => {},
  setGranularity: () => {},
  setGeoFilter: () => {},
  setUtmFilter: () => {},
})

export function useFilters() {
  return useContext(FilterContext)
}

// ─── Navigation Items ───────────────────────────────────────────────────────

const PORTAL_NAV_ITEMS = [
  { href: '/?tab=business', tab: 'business', label: 'State of Business', icon: '📊' },
  { href: '/?tab=trends', tab: 'trends', label: 'Trends', icon: '📈' },
  { href: '/?tab=attributions', tab: 'attributions', label: 'Attributions', icon: '🎯' },
  { href: '/?tab=attribution-trends', tab: 'attribution-trends', label: 'Attribution Trends', icon: '📊' },
  { href: '/?tab=traffic', tab: 'traffic', label: 'Traffic Trends', icon: '🌐' },
  { href: '/?tab=wizard', tab: 'wizard', label: 'Wizard Drop-offs', icon: '🧙' },
  { href: '/?tab=mab', tab: 'mab', label: 'Multi-Arm Bandit Stats', icon: '🎰' },
  { href: '/?tab=drip', tab: 'drip', label: 'Drip Campaign Stats', icon: '📧' },
  { href: '/?tab=logs', tab: 'logs', label: 'Log Search', icon: '🔍' },
]

const LEGACY_NAV_ITEMS = [
  { href: '/legacy', label: 'Overview', icon: '📊' },
  { href: '/legacy/users', label: 'User Growth', icon: '👥' },
  { href: '/legacy/sales', label: 'Sales & Revenue', icon: '💰' },
  { href: '/legacy/payouts', label: 'Payouts', icon: '💵' },
  { href: '/legacy/activity', label: 'Page Analytics', icon: '📱' },
  { href: '/legacy/health', label: 'Marketplace Health', icon: '🏪' },
  { href: '/legacy/settlements', label: 'Settlements', icon: '🏦' },
  { href: '/legacy/community', label: 'Community Chat', icon: '💬' },
  { href: '/legacy/attribution', label: 'Attribution', icon: '🎯' },
  { href: '/legacy/interests', label: 'Produce Interests', icon: '🥑' },
]

const LEGACY_MARKETING_ITEMS = [
  { href: '/legacy/marketing', label: 'Traffic Overview', icon: '📈' },
  { href: '/legacy/marketing/funnel', label: 'Lead Funnel', icon: '🔽' },
  { href: '/legacy/marketing/traffic', label: 'Traffic Analysis', icon: '📊' },
  { href: '/legacy/marketing/campaigns', label: 'Campaign Stats', icon: '📧' },
  { href: '/legacy/marketing/ab', label: 'Landing Page A/B Tests', icon: '🔬' },
  { href: '/legacy/marketing/wizard', label: 'Wizard Analytics', icon: '🧙' },
]

import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'business'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange)
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [geoFilter, setGeoFilter] = useState<GeoFilter>({})
  const [utmFilter, setUtmFilter] = useState<UtmFilter>({})

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <AuthGuard>
      <FilterContext.Provider value={{ dateRange, granularity, geoFilter, utmFilter, setDateRange, setGranularity, setGeoFilter, setUtmFilter }}>
        {/* Mobile toggle */}
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '✕' : '☰'}
        </button>

        {/* Sidebar */}
        <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">📊</div>
            <div>
              <div className="sidebar-logo-text">Metrics</div>
              <div className="sidebar-logo-sub">CasaGrown Analytics</div>
            </div>
          </div>

          <div className="sidebar-nav">
            <div className="sidebar-section-label">New Metrics Portal</div>
            {PORTAL_NAV_ITEMS.map(item => {
              const isActive = pathname === '/' && currentTab === item.tab
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}

            <div className="sidebar-section-label" style={{ marginTop: 16 }}>Legacy Dashboards</div>
            {LEGACY_NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}

            <div className="sidebar-section-label" style={{ marginTop: 16 }}>Legacy Marketing</div>
            {LEGACY_MARKETING_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sidebar footer */}
          <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-sm)',
                color: '#ef4444',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            >
              Sign Out
            </button>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              CasaGrown Metrics v0.1
            </div>
          </div>
        </nav>

        {/* Main */}
        <div className="main-content">
          <DemoBanner />
          {/* Filter Bar */}
          <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
            <div className="granularity-toggle">
              {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
                <button
                  key={g}
                  className={granularity === g ? 'active' : ''}
                  onClick={() => setGranularity(g)}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <div className="filter-group">
              <label>Country</label>
              <select
                className="select"
                value={geoFilter.country_code || 'US'}
                onChange={e => setGeoFilter({ ...geoFilter, country_code: e.target.value || undefined })}
                style={{ width: 110 }}
              >
                <option value="US">United States</option>
              </select>
            </div>
            <div className="filter-group">
              <label>State</label>
              <select
                className="select"
                value={geoFilter.state_code || ''}
                onChange={e => setGeoFilter({ ...geoFilter, state_code: e.target.value || undefined })}
                style={{ width: 120 }}
              >
                <option value="">All States</option>
                <option value="CA">California</option>
                <option value="TX">Texas</option>
                <option value="NY">New York</option>
                <option value="FL">Florida</option>
                <option value="IL">Illinois</option>
                <option value="WA">Washington</option>
              </select>
            </div>
            <div className="filter-group">
              <label>City</label>
              <input
                type="text"
                className="input"
                placeholder="Any city"
                value={geoFilter.city || ''}
                onChange={e => setGeoFilter({ ...geoFilter, city: e.target.value || undefined })}
                style={{ width: 120 }}
              />
            </div>
            <div className="filter-group">
              <label>Zip</label>
              <input
                type="text"
                className="input"
                placeholder="Any zip"
                value={geoFilter.zip_code || ''}
                onChange={e => setGeoFilter({ ...geoFilter, zip_code: e.target.value || undefined })}
                style={{ width: 90 }}
              />
            </div>
            {/* UTM Filters */}
            <div className="filter-group" style={{ marginLeft: 'auto' }}>
              <label>Source</label>
              <input type="text" className="input" placeholder="utm_source" value={utmFilter.utm_source || ''} onChange={e => setUtmFilter({ ...utmFilter, utm_source: e.target.value || undefined })} style={{ width: 100 }} />
            </div>
            <div className="filter-group">
              <label>Medium</label>
              <input type="text" className="input" placeholder="utm_medium" value={utmFilter.utm_medium || ''} onChange={e => setUtmFilter({ ...utmFilter, utm_medium: e.target.value || undefined })} style={{ width: 100 }} />
            </div>
            <div className="filter-group">
              <label>Campaign</label>
              <input type="text" className="input" placeholder="utm_campaign" value={utmFilter.utm_campaign || ''} onChange={e => setUtmFilter({ ...utmFilter, utm_campaign: e.target.value || undefined })} style={{ width: 100 }} />
            </div>
          </div>

          {children}
        </div>
      </FilterContext.Provider>
    </AuthGuard>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="loading-container">
        <div className="spinner" />
        <span>Initializing Analytics Portal...</span>
      </div>
    }>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  )
}
