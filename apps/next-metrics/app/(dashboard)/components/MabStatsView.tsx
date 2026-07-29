'use client'

import React, { useEffect, useState } from 'react'
import { fetchMabStats, type MabExperimentData } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { BarChart, formatNumber } from '../../../lib/charts'

export function MabStatsView() {
  const { utmFilter } = useFilters()
  const [experimentName, setExperimentName] = useState('listing_wizard_v2')
  const [data, setData] = useState<MabExperimentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchMabStats(experimentName, utmFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [experimentName, utmFilter])

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Multi-Arm Bandit (MAB) Stats</h1>
          <p className="page-subtitle">Thompson Sampling variant performance, conversion rates, and arm trend histograms</p>
        </div>
        <div className="filter-group">
          <label>Experiment</label>
          <select
            className="select"
            value={experimentName}
            onChange={e => setExperimentName(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="listing_wizard_v2">listing_wizard_v2</option>
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="loading-container">
          <div className="spinner" />
          <span>Fetching MAB experiment statistics...</span>
        </div>
      ) : (
        <>
          {/* Variant Arm KPI Grid */}
          <div className="kpi-grid stagger">
            {data.variants.map((v, i) => (
              <div key={v.id} className={`kpi-card ${i === 0 ? 'blue' : 'green'}`}>
                <span className="kpi-label">{v.name} ({v.slug})</span>
                <span className="kpi-value">{v.conversionRate}%</span>
                <span className="kpi-sub">
                  {formatNumber(v.conversionsCount)} / {formatNumber(v.viewsCount)} views (Win Prob: {v.winProbability}%)
                </span>
              </div>
            ))}
          </div>

          {/* Variant Arm Table */}
          <div className="card">
            <div className="chart-title" style={{ marginBottom: 16 }}>Bandit Variant Arm Performance & Priors</div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Variant Name</th>
                    <th>Slug / Route</th>
                    <th>Views / Impressions</th>
                    <th>Conversions</th>
                    <th>Conversion Rate</th>
                    <th>Prior Alpha / Beta</th>
                    <th>Win Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {data.variants.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No variants found for experiment "{experimentName}".
                      </td>
                    </tr>
                  ) : (
                    data.variants.map(v => (
                      <tr key={v.id}>
                        <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v.name}</td>
                        <td><code>{v.slug}</code></td>
                        <td>{formatNumber(v.viewsCount)}</td>
                        <td>{formatNumber(v.conversionsCount)}</td>
                        <td>
                          <span className="badge green">{v.conversionRate}%</span>
                        </td>
                        <td>$\alpha$: {v.priorConversions}, $\beta$: {v.priorFailures}</td>
                        <td>
                          <span className="badge purple">{v.winProbability}%</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historic Trends Per Arm */}
          <div className="card">
            <div className="chart-title">Historic Impressions & Conversions Per Arm</div>
            <BarChart
              data={data.historicTrends.map(d => ({ date: `${d.date} (${d.variantSlug})`, value: d.conversions }))}
              color="var(--chart-3)"
              height={220}
              formatValue={formatNumber}
            />
          </div>
        </>
      )}
    </div>
  )
}
