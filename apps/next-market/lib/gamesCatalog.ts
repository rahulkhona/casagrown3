/**
 * CASA GROWN TRADEMARK-SAFE DAILY GAMES CATALOG & DATE-SEEDED GENERATOR
 * Generates fresh, unique daily games every day at 6:00 AM Local Time based on date seed.
 */

export interface GameInstance {
  id: string
  category: string
  categoryName: string
  title: string
  subtitle: string
  difficulty: 'easy' | 'medium' | 'hard'
  rewardPoints: number
  targetWord?: string
  imageUrl?: string
  altImageUrl?: string
  clues?: string[]
  anagramText?: string
  solutionWord?: string
  varietyDetail?: string
  mathEquationStr?: string
  correctAnswer?: string | number
  nutritionFact?: string
  queensGridSize?: number
  queensSolution?: number[]
}

// 🌾 PRODUCE POOL FOR DAILY ROTATION (CROPS, NUTRITIONAL EQUATIONS & IMAGES)
const DAILY_CROPS = [
  { word: 'LEMON', anagram: 'S-M-O-N-E-L', solution: 'LEMONS', image: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg', math: '🥑 1 Avocado (10g) + 🫐 Blueberries (4g) x 🍋 Lemon (2g) = ?', answer: '18', detail: 'Meyer Lemons — Sweet, juicy backyard citrus' },
  { word: 'APPLE', anagram: 'P-P-L-A-E-S', solution: 'APPLES', image: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Red_Apple.jpg', math: '🍎 1 Apple (4g) + 🫐 Blueberries (4g) x 2 = ?', answer: '12', detail: 'Honeycrisp Apples — Crisp, sweet local harvest' },
  { word: 'PEACH', anagram: 'C-H-P-A-E-S', solution: 'PEACHES', image: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Prunus_persica_fruit.jpg', math: '🍑 1 Peach (3g) + 🍓 Strawberries (3g) x 3 = ?', answer: '12', detail: 'Elberta Peaches — Juicy summer backyard stonefruit' },
  { word: 'GRAPE', anagram: 'P-E-R-A-G-S', solution: 'GRAPES', image: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Table_grapes_on_white.jpg', math: '🍇 1 Grape Cluster (2g) + 🥑 Avocado (10g) = ?', answer: '12', detail: 'Flame Seedless Grapes — Sweet table grapes' },
  { word: 'BERRY', anagram: 'R-R-E-B-Y-S', solution: 'BERRIES', image: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Culinary_fruits_front_view.jpg', math: '🫐 2 Blueberry Packs (8g) + 🍓 Strawberry (3g) = ?', answer: '11', detail: 'Organic Blackberries — Antioxident-rich garden berries' },
  { word: 'MANGO', anagram: 'G-O-M-N-A-S', solution: 'MANGOES', image: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Haden_mango_aa.jpg', math: '🥭 1 Mango (5g) + 🍎 Apple (4g) x 2 = ?', answer: '13', detail: 'Haden Mangoes — Sweet tropical backyard harvest' },
  { word: 'CHERRY', anagram: 'R-R-E-C-H-Y', solution: 'CHERRIES', image: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Cherry_md.jpg', math: '🍒 1 Cherry Bowl (3g) + 🥑 1 Avocado (10g) = ?', answer: '13', detail: 'Bing Cherries — Dark red sweet local stonefruit' },
  { word: 'CARROT', anagram: 'R-R-A-C-O-T', solution: 'CARROTS', image: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Carrot_vegetable.jpg', math: '🥕 2 Carrots (4g) + 🥑 1 Avocado (10g) = ?', answer: '14', detail: 'Nantes Carrots — Sweet, crunch heirloom roots' },
  { word: 'FIGS', anagram: 'F-I-G-S-S', solution: 'FIGS', image: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Figs_fruit.jpg', math: '🍇 2 Fig Packs (6g) + 🍎 Apple (4g) x 2 = ?', answer: '14', detail: 'Black Mission Figs — Sweet honeyed backyard fruit' },
  { word: 'PLUM', anagram: 'P-L-U-M-S', solution: 'PLUMS', image: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Plums_on_white.jpg', math: '🍑 1 Plum (2g) + 🥑 Avocado (10g) x 2 = ?', answer: '22', detail: 'Santa Rosa Plums — Tangy sweet heirloom plum' },
  { word: 'GUAVA', anagram: 'G-U-A-V-A', solution: 'GUAVAS', image: 'https://upload.wikimedia.org/wikipedia/commons/0/02/Guava_ID.jpg', math: '🥑 1 Guava (9g) + 🍓 Strawberry (3g) x 2 = ?', answer: '15', detail: 'Pink Guavas — Vitamin C-rich tropical harvest' },
  { word: 'MELON', anagram: 'M-E-L-O-N', solution: 'MELONS', image: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Cantaloupe_and_cross_section_binary.jpg', math: '🍈 1 Cantaloupe (2g) + 🥑 Avocado (10g) = ?', answer: '12', detail: 'Cantaloupe Melons — Sweet summer melon' },
]

/** Simple deterministic hash function for date strings YYYY-MM-DD */
function getDayHash(dateStr: string): number {
  const parts = dateStr.split('-')
  const year = parseInt(parts[0], 10) || 2026
  const month = parseInt(parts[1], 10) || 1
  const day = parseInt(parts[2], 10) || 1

  // Day of year calculation for perfect 365-day rotation
  const now = new Date(year, month - 1, day)
  const start = new Date(year, 0, 0)
  const diff = now.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay)

  return dayOfYear
}

/** 
 * Get Today's Global Daily Game Date String (YYYY-MM-DD)
 * Evaluated in US Eastern Time with a 5:00 AM EST reset boundary.
 * All players globally solve the EXACT SAME daily puzzle set on any given day.
 */
export function getTodayDateStr(): string {
  const now = new Date()
  // Subtract 5 hours so the new daily game unlocks at 5:00 AM EST (10:00 UTC)
  const offsetTime = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  try {
    const etStr = offsetTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    return etStr // YYYY-MM-DD
  } catch {
    return offsetTime.toISOString().split('T')[0]
  }
}

/** Returns deterministically dynamic games generated for today's date */
export function getTodayGames(dateStr = getTodayDateStr()): GameInstance[] {
  const seed = getDayHash(dateStr)
  const cropIdx = seed % DAILY_CROPS.length
  const crop = DAILY_CROPS[cropIdx]

  const altCropIdx = (seed + 3) % DAILY_CROPS.length
  const altCrop = DAILY_CROPS[altCropIdx]

  return [
    {
      id: `garden_spell_${dateStr}`,
      category: 'garden_spell',
      categoryName: 'Garden Spell',
      title: "Today's Garden Spell",
      subtitle: `Guess today's 5-letter garden crop starting with "${crop.word[0]}"!`,
      difficulty: 'easy',
      rewardPoints: 50,
      targetWord: crop.word,
    },
    {
      id: `jigsaw_${dateStr}`,
      category: 'jigsaw',
      categoryName: 'Harvest Jigsaw',
      title: "Today's Harvest Jigsaw",
      subtitle: `Assemble the picture tiles into fresh ${crop.solution}!`,
      difficulty: 'medium',
      rewardPoints: 50,
      imageUrl: crop.image,
    },
    {
      id: `math_${dateStr}`,
      category: 'math',
      categoryName: 'Harvest Nutri-Calc',
      title: "Today's Nutri-Calc",
      subtitle: 'Solve today\'s dietary fiber & Vitamin C equations!',
      difficulty: 'medium',
      rewardPoints: 50,
      mathEquationStr: crop.math,
      correctAnswer: crop.answer,
      nutritionFact: `💡 ${crop.detail} provide essential dietary fiber and antioxidants!`,
    },
    {
      id: `garden_plots_${dateStr}`,
      category: 'garden_plots',
      categoryName: 'Garden Plots',
      title: "Today's Garden Plots",
      subtitle: `Plant 1 ${crop.word} 🍋 in each row, col, and colored plot region!`,
      difficulty: 'hard',
      rewardPoints: 50,
      queensGridSize: 6,
      queensSolution: [(seed % 6), (seed + 2) % 6, (seed + 4) % 6, (seed + 1) % 6, (seed + 3) % 6, (seed + 5) % 6],
    },
    {
      id: `memory_match_${dateStr}`,
      category: 'memory_match',
      categoryName: 'Garden Memory Match',
      title: "Today's Memory Match",
      subtitle: 'Match fresh produce with USDA nutrition & local stand prices!',
      difficulty: 'easy',
      rewardPoints: 50,
    },
    {
      id: `anagram_${dateStr}`,
      category: 'anagram',
      categoryName: 'Crop Anagram',
      title: "Today's Crop Anagram",
      subtitle: 'Unscramble the letters to reveal today\'s harvest crop!',
      difficulty: 'easy',
      rewardPoints: 50,
      anagramText: altCrop.anagram,
      solutionWord: altCrop.solution,
      varietyDetail: altCrop.detail,
    },
  ]
}

export const TODAY_DAILY_GAMES = getTodayGames()

export function getGameById(id: string): GameInstance | null {
  const todayGames = getTodayGames()
  
  // 1. Exact match on today's ID (e.g. math_2026-08-10)
  const exactMatch = todayGames.find(g => g.id === id)
  if (exactMatch) return exactMatch

  // 2. Category fallback (e.g. /games/math or /games/math_001 -> maps to today's math game)
  const categoryMatch = todayGames.find(g => id.startsWith(g.category) || g.category.startsWith(id.replace(/_\d+$/, '')))
  if (categoryMatch) return categoryMatch

  return todayGames[0]
}
