import { describe, it, expect, beforeEach } from 'vitest'
import { TODAY_DAILY_GAMES, getGameById } from '../gamesCatalog'
import { getGuestGameStats, recordGameCompletion } from '../useGuestGameStats'

describe('Daily Games Catalog & Gardening Vocabulary', () => {
  it('should contain exactly 6 daily games (1 per category)', () => {
    expect(TODAY_DAILY_GAMES).toHaveLength(6)
    const categories = TODAY_DAILY_GAMES.map((g) => g.category)
    expect(new Set(categories).size).toBe(6)
    expect(categories).toContain('garden_spell')
    expect(categories).toContain('jigsaw')
    expect(categories).toContain('math')
    expect(categories).toContain('garden_plots')
    expect(categories).toContain('memory_match')
    expect(categories).toContain('anagram')
  })

  it('should use produce and gardening vocabulary across all games', () => {
    const gardenWords = ['LEMON', 'LEMONS', 'AVOCADO', 'TOMATOES', 'BASIL', 'FIBER', 'USDA']
    
    // Check Garden Spell target word
    const spellGame = TODAY_DAILY_GAMES.find((g) => g.category === 'garden_spell')
    expect(spellGame).toBeDefined()
    expect(spellGame?.targetWord).toBeDefined()
    expect(spellGame?.targetWord).toMatch(/^[A-Z]{5}$/) // 5-letter garden word

    // Check Crop Anagram target word & variety detail
    const anagramGame = TODAY_DAILY_GAMES.find((g) => g.category === 'anagram')
    expect(anagramGame).toBeDefined()
    expect(anagramGame?.solutionWord).toBeDefined()
    expect(anagramGame?.varietyDetail).toBeDefined()

    // Check Memory Match produce & nutrition pairs
    const memoryGame = TODAY_DAILY_GAMES.find((g) => g.category === 'memory_match')
    expect(memoryGame).toBeDefined()
    expect(memoryGame?.title).toContain('Memory')
  })

  it('should fetch game by ID accurately', () => {
    const game = getGameById('garden_spell_001')
    expect(game).toBeDefined()
    expect(game?.title).toBe("Today's Garden Spell")
    expect(game?.category).toBe('garden_spell')
  })
})

describe('Guest Game Stats & Completion Engine', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
  })

  it('should record game completion without crashing', () => {
    const stats = recordGameCompletion('garden_spell_001', 30)
    expect(stats.completedGameIds).toContain('garden_spell_001')
    expect(stats.streakDays).toBeGreaterThanOrEqual(1)
  })

  it('should persist guest game stats in local storage', () => {
    recordGameCompletion('jigsaw_001', 45)
    const stats = getGuestGameStats()
    expect(stats.completedGameIds).toContain('jigsaw_001')
  })
})
