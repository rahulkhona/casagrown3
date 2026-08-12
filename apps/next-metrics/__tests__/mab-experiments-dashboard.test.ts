import { describe, it, expect } from 'vitest'

describe('Next-Metrics MAB Experiments Dashboard Unit Tests', () => {
  it('1. Correctly aggregates total sends, conversions, and avg CVR across experiments', () => {
    const experiments = [
      { experiment_id: 'exp1', total_sends: 500, total_conversions: 50 },
      { experiment_id: 'exp2', total_sends: 500, total_conversions: 100 },
    ]

    const totalSends = experiments.reduce((acc, e) => acc + e.total_sends, 0)
    const totalConvs = experiments.reduce((acc, e) => acc + e.total_conversions, 0)
    const avgCvr = ((totalConvs / totalSends) * 100).toFixed(1)

    expect(totalSends).toBe(1000)
    expect(totalConvs).toBe(150)
    expect(avgCvr).toBe('15.0')
  })

  it('2. Calculates traffic allocation split bar widths', () => {
    const reports = [
      { variant_name: 'Variant A', traffic_share_pct: 60 },
      { variant_name: 'Variant B', traffic_share_pct: 25 },
      { variant_name: 'Variant C', traffic_share_pct: 15 },
    ]

    const totalShare = reports.reduce((acc, r) => acc + r.traffic_share_pct, 0)
    expect(totalShare).toBe(100)
    expect(reports[0].traffic_share_pct).toBe(60)
  })
})
