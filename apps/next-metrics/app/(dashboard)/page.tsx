'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { StateOfBusinessView } from './components/StateOfBusinessView'
import { TrendsView } from './components/TrendsView'
import { AttributionsView } from './components/AttributionsView'
import { AttributionTrendsView } from './components/AttributionTrendsView'
import { TrafficTrendsView } from './components/TrafficTrendsView'
import { WizardDropoffsView } from './components/WizardDropoffsView'
import { MabStatsView } from './components/MabStatsView'
import { DripCampaignStatsView } from './components/DripCampaignStatsView'
import { LogSearchView } from './components/LogSearchView'

type PortalTab =
  | 'business'
  | 'trends'
  | 'attributions'
  | 'attribution-trends'
  | 'traffic'
  | 'wizard'
  | 'mab'
  | 'drip'
  | 'logs'

const TABS: { id: PortalTab; label: string; icon: string }[] = [
  { id: 'business', label: 'State of Business', icon: '📊' },
  { id: 'trends', label: 'Trends', icon: '📈' },
  { id: 'attributions', label: 'Attributions', icon: '🎯' },
  { id: 'attribution-trends', label: 'Attribution Trends', icon: '📊' },
  { id: 'traffic', label: 'Traffic Trends', icon: '🌐' },
  { id: 'wizard', label: 'Wizard Drop-offs', icon: '🧙' },
  { id: 'mab', label: 'Multi-Arm Bandit Stats', icon: '🎰' },
  { id: 'drip', label: 'Drip Campaign Stats', icon: '📧' },
  { id: 'logs', label: 'Log Search', icon: '🔍' },
]

import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

function MetricsPortalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as PortalTab | null
  const activeTab: PortalTab = (tabParam && TABS.some(t => t.id === tabParam)) ? tabParam : 'business'

  const handleTabChange = (tabId: PortalTab) => {
    router.push(`/?tab=${tabId}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Portal Tab Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === tab.id ? 'var(--accent-green)' : 'transparent',
              color: activeTab === tab.id ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === tab.id ? 600 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content Views */}
      {activeTab === 'business' && <StateOfBusinessView />}
      {activeTab === 'trends' && <TrendsView />}
      {activeTab === 'attributions' && <AttributionsView />}
      {activeTab === 'attribution-trends' && <AttributionTrendsView />}
      {activeTab === 'traffic' && <TrafficTrendsView />}
      {activeTab === 'wizard' && <WizardDropoffsView />}
      {activeTab === 'mab' && <MabStatsView />}
      {activeTab === 'drip' && <DripCampaignStatsView />}
      {activeTab === 'logs' && <LogSearchView />}
    </div>
  )
}

export default function MetricsPortalPage() {
  return (
    <Suspense fallback={
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading Metrics Tab...</span>
      </div>
    }>
      <MetricsPortalContent />
    </Suspense>
  )
}
