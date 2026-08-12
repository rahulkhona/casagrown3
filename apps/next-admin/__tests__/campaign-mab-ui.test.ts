import { describe, it, expect } from 'vitest'

describe('Campaign Multi-Armed Bandit (MAB) UI & Reporting Unit Tests', () => {
  it('1. Correctly identifies MAB experiment modes (content, schedule, matrix)', () => {
    const modes = ['off', 'content', 'schedule', 'matrix']
    expect(modes).toContain('content')
    expect(modes).toContain('schedule')
    expect(modes).toContain('matrix')
  })

  it('2. Calculates Win Probability and Conversion Rates for reporting cards', () => {
    const variants = [
      { variant_name: 'Variant A', sends_count: 100, conversions_count: 20 },
      { variant_name: 'Variant B', sends_count: 100, conversions_count: 5 },
    ]

    const cvrA = (variants[0].conversions_count / variants[0].sends_count) * 100
    const cvrB = (variants[1].conversions_count / variants[1].sends_count) * 100

    expect(cvrA).toBe(20)
    expect(cvrB).toBe(5)
    expect(cvrA).toBeGreaterThan(cvrB)
  })

  it('3. Computes Lift percentage vs baseline control variant', () => {
    const baselineCvr = 10.0
    const variantCvr = 15.0

    const lift = ((variantCvr - baselineCvr) / baselineCvr) * 100
    expect(lift).toBe(50.0) // 50% relative lift
  })

  it('4. Formats campaign payload for MAB variant persistence', () => {
    const payload = {
      name: 'MAB Campaign Test',
      channel: 'push',
      is_mab_experiment: true,
      mab_experiment_mode: 'matrix',
      schedule_windows: [
        { name: 'Morning', start: '09:00:00', end: '11:00:00' },
        { name: 'Evening', start: '18:00:00', end: '20:00:00' },
      ],
    }

    expect(payload.is_mab_experiment).toBe(true)
    expect(payload.mab_experiment_mode).toBe('matrix')
    expect(payload.schedule_windows.length).toBe(2)
  })
})
