/**
 * GrowBot Share Content Validation Tests
 *
 * These tests validate the CONTENT of shared poll data, not just rendering.
 * They catch regressions where the share message, OG metadata, or action
 * card data loses meaningful content during refactoring.
 *
 * Run: cd apps/next-market && npx vitest run app/__tests__/growbot-share-content.test.ts
 */
import { describe, it, expect } from 'vitest'
import { summarizeActions, buildPollShareMessage } from '../../lib/growbot-share-utils'

// ════════════════════════════════════════════════════════════════
// summarizeActions — content extraction from action cards
// ════════════════════════════════════════════════════════════════

describe('summarizeActions — content extraction', () => {
  it('returns empty string for undefined/null/empty actions', () => {
    expect(summarizeActions(undefined)).toBe('')
    expect(summarizeActions(null as any)).toBe('')
    expect(summarizeActions([])).toBe('')
  })

  // ── DiagnosisCard ──
  describe('DiagnosisCard', () => {
    const diagnosisAction = {
      type: 'DiagnosisCard',
      data: {
        diagnosis: 'Early Blight (Alternaria solani)',
        urgency: 'Medium',
        remedy_plan: '1. Remove infected leaves\n2. Apply copper fungicide\n3. Improve air circulation',
      },
    }

    it('includes the diagnosis name', () => {
      const result = summarizeActions([diagnosisAction])
      expect(result).toContain('Early Blight (Alternaria solani)')
    })

    it('includes the urgency level', () => {
      const result = summarizeActions([diagnosisAction])
      expect(result).toContain('Medium')
    })

    it('includes the full remedy plan', () => {
      const result = summarizeActions([diagnosisAction])
      expect(result).toContain('Remove infected leaves')
      expect(result).toContain('Apply copper fungicide')
      expect(result).toContain('Improve air circulation')
    })

    it('handles camelCase remedyPlan field', () => {
      const action = {
        type: 'DiagnosisCard',
        data: { diagnosis: 'Powdery Mildew', urgency: 'Low', remedyPlan: 'Apply neem oil' },
      }
      const result = summarizeActions([action])
      expect(result).toContain('Powdery Mildew')
      expect(result).toContain('Apply neem oil')
    })

    it('falls back gracefully when fields are missing', () => {
      const action = { type: 'DiagnosisCard', data: {} }
      const result = summarizeActions([action])
      expect(result).toContain('Diagnosis: Unknown')
      expect(result).toContain('Urgency: N/A')
    })
  })

  // ── PlantIdentificationCard ──
  describe('PlantIdentificationCard', () => {
    const identAction = {
      type: 'PlantIdentificationCard',
      data: {
        common_name: 'Basil',
        scientific_name: 'Ocimum basilicum',
        description: 'A popular culinary herb in the mint family.',
      },
    }

    it('includes the common name', () => {
      const result = summarizeActions([identAction])
      expect(result).toContain('Basil')
    })

    it('includes the scientific name', () => {
      const result = summarizeActions([identAction])
      expect(result).toContain('Ocimum basilicum')
    })

    it('includes the description', () => {
      const result = summarizeActions([identAction])
      expect(result).toContain('popular culinary herb')
    })

    it('handles camelCase fields (commonName, scientificName, careTips)', () => {
      const action = {
        type: 'PlantIdentificationCard',
        data: { commonName: 'Rosemary', scientificName: 'Salvia rosmarinus', careTips: 'Full sun, well-drained soil' },
      }
      const result = summarizeActions([action])
      expect(result).toContain('Rosemary')
      expect(result).toContain('Salvia rosmarinus')
      expect(result).toContain('Full sun')
    })

    it('uses name field as fallback for common_name', () => {
      const action = {
        type: 'PlantIdentificationCard',
        data: { name: 'Lavender' },
      }
      const result = summarizeActions([action])
      expect(result).toContain('Lavender')
    })
  })

  // ── RecipeCard ──
  describe('RecipeCard', () => {
    const recipeAction = {
      type: 'RecipeCard',
      data: {
        name: 'Caprese Salad',
        description: 'A fresh Italian salad with tomatoes, mozzarella, and basil.',
        ingredients: ['4 ripe tomatoes', '200g fresh mozzarella', 'Fresh basil leaves', 'Olive oil', 'Salt & pepper'],
      },
    }

    it('includes the recipe name', () => {
      const result = summarizeActions([recipeAction])
      expect(result).toContain('Caprese Salad')
    })

    it('includes the description', () => {
      const result = summarizeActions([recipeAction])
      expect(result).toContain('fresh Italian salad')
    })

    it('includes all ingredients', () => {
      const result = summarizeActions([recipeAction])
      expect(result).toContain('4 ripe tomatoes')
      expect(result).toContain('200g fresh mozzarella')
      expect(result).toContain('Fresh basil leaves')
      expect(result).toContain('Olive oil')
    })

    it('handles title field as fallback for name', () => {
      const action = {
        type: 'RecipeCard',
        data: { title: 'Pesto Pasta', ingredients: 'basil, pine nuts, garlic' },
      }
      const result = summarizeActions([action])
      expect(result).toContain('Pesto Pasta')
      expect(result).toContain('basil, pine nuts, garlic')
    })

    it('handles string ingredients (not array)', () => {
      const action = {
        type: 'RecipeCard',
        data: { name: 'Smoothie', ingredients: 'banana, spinach, almond milk' },
      }
      const result = summarizeActions([action])
      expect(result).toContain('banana, spinach, almond milk')
    })
  })

  // ── Multiple actions ──
  it('combines multiple card types with separator', () => {
    const actions = [
      { type: 'DiagnosisCard', data: { diagnosis: 'Root Rot', urgency: 'High', remedy_plan: 'Reduce watering' } },
      { type: 'RecipeCard', data: { name: 'Herb Tea', ingredients: ['mint', 'chamomile'] } },
    ]
    const result = summarizeActions(actions)
    expect(result).toContain('Root Rot')
    expect(result).toContain('Herb Tea')
    expect(result).toContain('mint')
  })

  // ── Unknown/skip card types ──
  it('skips unknown card types without crashing', () => {
    const actions = [
      { type: 'UserMemoryCard', data: { note: 'test' } },
      { type: 'DiagnosisCard', data: { diagnosis: 'Aphids', urgency: 'Low' } },
    ]
    const result = summarizeActions(actions)
    expect(result).toContain('Aphids')
    expect(result).not.toContain('test')
  })
})

// ════════════════════════════════════════════════════════════════
// buildPollShareMessage — full share message construction
// ════════════════════════════════════════════════════════════════

describe('buildPollShareMessage — share message content', () => {
  it('includes the question in quotes', () => {
    const msg = buildPollShareMessage('What plant is this?', 'It appears to be basil.')
    expect(msg).toContain('"What plant is this?"')
  })

  it('includes the answer text when provided', () => {
    const msg = buildPollShareMessage('Help!', 'Your tomato has early blight. Remove affected leaves.')
    expect(msg).toContain('early blight')
    expect(msg).toContain('Remove affected leaves')
  })

  it('includes the GrowBot attribution emoji', () => {
    const msg = buildPollShareMessage('test', 'answer')
    expect(msg).toContain('🌱')
    expect(msg).toContain('GrowBot')
  })

  it('includes the vote CTA', () => {
    const msg = buildPollShareMessage('test', 'answer')
    expect(msg).toContain('🗳️')
    expect(msg).toContain('accurate')
  })

  it('uses action card content when answer text is empty', () => {
    const actions = [{
      type: 'DiagnosisCard',
      data: { diagnosis: 'Powdery Mildew', urgency: 'Medium', remedy_plan: 'Apply neem oil spray weekly' },
    }]
    const msg = buildPollShareMessage('my basil has white spots', '', actions)
    expect(msg).toContain('Powdery Mildew')
    expect(msg).toContain('neem oil')
  })

  it('uses action card content when answer is whitespace-only', () => {
    const actions = [{
      type: 'PlantIdentificationCard',
      data: { common_name: 'Mint', scientific_name: 'Mentha' },
    }]
    const msg = buildPollShareMessage('what is this plant?', '   \n  ', actions)
    expect(msg).toContain('Mint')
    expect(msg).toContain('Mentha')
  })

  it('strips markdown from answer text (bold, italic, headings)', () => {
    const msg = buildPollShareMessage('test', '**Bold text** and *italic*\n### Heading\nMore text')
    expect(msg).not.toContain('**')
    expect(msg).not.toContain('###')
    expect(msg).toContain('Bold text')
    expect(msg).toContain('italic')
    expect(msg).toContain('Heading')
  })

  it('truncates very long answers at 500 chars', () => {
    const longAnswer = 'A'.repeat(600)
    const msg = buildPollShareMessage('test', longAnswer)
    expect(msg).toContain('…')
    // The truncated portion should be 500 chars
    const answerPart = msg.split("Here's what GrowBot said:\n")[1]?.split('\n\n🗳️')[0]
    expect(answerPart!.length).toBeLessThanOrEqual(501) // 500 + ellipsis
  })

  it('prefers answer text over actions when both exist', () => {
    const actions = [{
      type: 'DiagnosisCard',
      data: { diagnosis: 'Root Rot' },
    }]
    const msg = buildPollShareMessage('help', 'Your plant needs more water.', actions)
    expect(msg).toContain('more water')
    // Should NOT contain the action card fallback since answer text exists
    expect(msg).not.toContain('Root Rot')
  })
})
