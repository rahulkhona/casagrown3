/**
 * Content Moderation — Unit Tests
 *
 * Tests the client-side checkTextForViolations function used by both
 * product listings and catalog items to block banned content at the UI layer.
 */
import { describe, it, expect } from 'vitest'
import { checkTextForViolations, BLOCKED_CONTENT } from '../moderation'

describe('checkTextForViolations', () => {
  // ── Clean content (should pass) ──────────────────────────────

  it('allows normal produce names', () => {
    expect(checkTextForViolations('Organic Heirloom Tomatoes').isClean).toBe(true)
  })

  it('allows garden equipment names', () => {
    expect(checkTextForViolations('Heavy Duty Garden Hoe').isClean).toBe(true)
  })

  it('allows flower names', () => {
    expect(checkTextForViolations('Sunflower Bouquet — mixed varieties').isClean).toBe(true)
  })

  it('allows preserves and honey', () => {
    expect(checkTextForViolations('Strawberry Preserves with vanilla').isClean).toBe(true)
    expect(checkTextForViolations('Raw Wildflower Honey 16oz jar').isClean).toBe(true)
  })

  it('allows catalog descriptions with growing methods', () => {
    expect(checkTextForViolations(
      'Grown in raised beds using organic compost. No pesticides, hand-picked daily.'
    ).isClean).toBe(true)
  })

  // ── Profanity (should block) ─────────────────────────────────

  it('blocks profanity in product name', () => {
    const result = checkTextForViolations('Fucking great tomatoes')
    expect(result.isClean).toBe(false)
    expect(result.error).toContain('profanity')
  })

  it('blocks profanity in description', () => {
    const result = checkTextForViolations('These are some badass shit peppers')
    expect(result.isClean).toBe(false)
  })

  it('blocks profanity with character substitution', () => {
    const result = checkTextForViolations('What the sh1t is this')
    expect(result.isClean).toBe(false)
  })

  // ── Banned substances (should block) ─────────────────────────

  it('blocks cannabis product names', () => {
    const result = checkTextForViolations('Cannabis Infused Honey')
    expect(result.isClean).toBe(false)
    expect(result.error).toContain('Cannabis')
  })

  it('blocks marijuana references', () => {
    const result = checkTextForViolations('Homegrown Marijuana Edibles')
    expect(result.isClean).toBe(false)
  })

  it('blocks THC/CBD products', () => {
    expect(checkTextForViolations('THC Gummies 10mg').isClean).toBe(false)
    expect(checkTextForViolations('CBD Oil Extract').isClean).toBe(false)
  })

  it('blocks weed references', () => {
    expect(checkTextForViolations('Premium Weed Buds').isClean).toBe(false)
  })

  it('blocks hard drugs', () => {
    expect(checkTextForViolations('Cocaine powder').isClean).toBe(false)
    expect(checkTextForViolations('Pure heroin').isClean).toBe(false)
    expect(checkTextForViolations('Crystal meth').isClean).toBe(false)
  })

  // ── Weapons (should block) ───────────────────────────────────

  it('blocks firearms', () => {
    const result = checkTextForViolations('Hunting rifle for sale')
    expect(result.isClean).toBe(false)
    expect(result.error).toContain('Weapons')
  })

  it('blocks ammunition', () => {
    expect(checkTextForViolations('9mm ammunition box').isClean).toBe(false)
  })

  it('blocks knives/blades', () => {
    expect(checkTextForViolations('Tactical knife set').isClean).toBe(false)
    expect(checkTextForViolations('Samurai sword display').isClean).toBe(false)
  })

  // ── Violence (should block) ──────────────────────────────────

  it('blocks violent language', () => {
    const result = checkTextForViolations('I will kill anyone who steals my tomatoes')
    expect(result.isClean).toBe(false)
    expect(result.error).toContain('violence')
  })

  it('blocks bomb references', () => {
    expect(checkTextForViolations('These peppers are like a bomb').isClean).toBe(false)
  })

  // ── Adult content (should block) ─────────────────────────────

  it('blocks adult content references', () => {
    expect(checkTextForViolations('Nude garden photoshoot').isClean).toBe(false)
    expect(checkTextForViolations('Porn star tomatoes').isClean).toBe(false)
  })

  // ── Edge cases ───────────────────────────────────────────────

  it('allows empty string', () => {
    expect(checkTextForViolations('').isClean).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(checkTextForViolations('CANNABIS Oil').isClean).toBe(false)
    expect(checkTextForViolations('FUCK').isClean).toBe(false)
  })

  // ── BLOCKED_CONTENT patterns exported ────────────────────────

  it('exports BLOCKED_CONTENT array with patterns', () => {
    expect(Array.isArray(BLOCKED_CONTENT)).toBe(true)
    expect(BLOCKED_CONTENT.length).toBeGreaterThan(10)
    expect(BLOCKED_CONTENT[0]).toHaveProperty('pattern')
    expect(BLOCKED_CONTENT[0]).toHaveProperty('message')
  })
})
