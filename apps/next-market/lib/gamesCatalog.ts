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
  { word: 'LEMON', anagram: 'S-M-O-N-E-L', solution: 'LEMONS', image: '/images/catalog/studio_mandarins.jpg', math: '🥑 1 Avocado (10g) + 🫐 Blueberries (4g) x 🍋 Lemon (2g) = ?', answer: '18', detail: 'Meyer Lemons — Sweet, juicy backyard citrus' },
  { word: 'APPLE', anagram: 'S-E-L-P-P-A', solution: 'APPLES', image: '/images/catalog/studio_apples.jpg', math: '🍎 1 Apple (4g) + 🫐 Blueberries (4g) x 2 = ?', answer: '12', detail: 'Honeycrisp Apples — Crisp, sweet local harvest' },
  { word: 'PEACH', anagram: 'S-E-H-C-A-E-P', solution: 'PEACHES', image: '/images/catalog/studio_nectarines.jpg', math: '🍑 1 Peach (3g) + 🍓 Strawberries (3g) x 3 = ?', answer: '12', detail: 'Elberta Peaches — Juicy summer backyard stonefruit' },
  { word: 'GRAPE', anagram: 'S-E-P-A-R-G', solution: 'GRAPES', image: '/images/catalog/studio_grapes.jpg', math: '🍇 1 Grape Cluster (2g) + 🥑 Avocado (10g) = ?', answer: '12', detail: 'Flame Seedless Grapes — Sweet table grapes' },
  { word: 'BERRY', anagram: 'S-E-I-R-R-E-B', solution: 'BERRIES', image: '/images/catalog/studio_blackberries.jpg', math: '🫐 2 Blueberry Packs (8g) + 🍓 Strawberry (3g) = ?', answer: '11', detail: 'Organic Blackberries — Antioxident-rich garden berries' },
  { word: 'MANGO', anagram: 'S-E-O-G-N-A-M', solution: 'MANGOES', image: '/images/catalog/studio_mangoes.jpg', math: '🥭 1 Mango (5g) + 🍎 Apple (4g) x 2 = ?', answer: '13', detail: 'Haden Mangoes — Sweet tropical backyard harvest' },
  { word: 'CHERRY', anagram: 'S-E-I-R-R-E-H-C', solution: 'CHERRIES', image: '/images/catalog/studio_cherries.jpg', math: '🍒 1 Cherry Bowl (3g) + 🥑 1 Avocado (10g) = ?', answer: '13', detail: 'Bing Cherries — Dark red sweet local stonefruit' },
  { word: 'CARROT', anagram: 'S-T-O-R-R-A-C', solution: 'CARROTS', image: '/images/catalog/studio_carrots.jpg', math: '🥕 2 Carrots (4g) + 🥑 1 Avocado (10g) = ?', answer: '14', detail: 'Nantes Carrots — Sweet, crunch heirloom roots' },
  { word: 'FIGS', anagram: 'S-G-I-F', solution: 'FIGS', image: '/images/catalog/studio_fig_sapling.jpg', math: '🍇 2 Fig Packs (6g) + 🍎 Apple (4g) x 2 = ?', answer: '14', detail: 'Black Mission Figs — Sweet honeyed backyard fruit' },
  { word: 'PLUM', anagram: 'S-M-U-L-P', solution: 'PLUMS', image: '/images/catalog/studio_plums.jpg', math: '🍑 1 Plum (2g) + 🥑 Avocado (10g) x 2 = ?', answer: '22', detail: 'Santa Rosa Plums — Tangy sweet heirloom plum' },
  { word: 'GUAVA', anagram: 'S-A-V-A-U-G', solution: 'GUAVAS', image: '/images/catalog/studio_guavas.jpg', math: '🥑 1 Guava (9g) + 🍓 Strawberry (3g) x 3 = ?', answer: '18', detail: 'Pink Guavas — Vitamin C-rich tropical harvest' },
  { word: 'MELON', anagram: 'S-N-O-L-E-M', solution: 'MELONS', image: '/images/catalog/studio_cantaloupe.jpg', math: '🍈 1 Cantaloupe (2g) + 🥑 Avocado (10g) = ?', answer: '12', detail: 'Cantaloupe Melons — Sweet summer melon' },
]

/// 🌾 74-STUDIO PRODUCE ASSETS POOL (Local, High-Res, Zero Network Latency)
const STUDIO_IMAGE_POOL = [
  '/images/catalog/studio_mandarins.jpg',
  '/images/catalog/studio_apples.jpg',
  '/images/catalog/studio_nectarines.jpg',
  '/images/catalog/studio_grapes.jpg',
  '/images/catalog/studio_blackberries.jpg',
  '/images/catalog/studio_mangoes.jpg',
  '/images/catalog/studio_cherries.jpg',
  '/images/catalog/studio_carrots.jpg',
  '/images/catalog/studio_fig_sapling.jpg',
  '/images/catalog/studio_plums.jpg',
  '/images/catalog/studio_guavas.jpg',
  '/images/catalog/studio_cantaloupe.jpg',
  '/images/catalog/studio_strawberries.jpg',
  '/images/catalog/studio_blueberries.jpg',
  '/images/catalog/studio_raspberries.jpg',
  '/images/catalog/studio_watermelon.jpg',
  '/images/catalog/studio_pears.jpg',
  '/images/catalog/studio_honeycomb.jpg',
  '/images/catalog/studio_sunflowers.jpg',
  '/images/catalog/studio_dahlias.jpg',
  '/images/catalog/studio_kale.jpg',
  '/images/catalog/studio_spinach.jpg',
  '/images/catalog/studio_cucumbers.jpg',
  '/images/catalog/studio_eggplant.jpg',
  '/images/catalog/studio_pumpkins.jpg',
  '/images/catalog/studio_asparagus.jpg',
  '/images/catalog/studio_avocado_sapling.jpg',
  '/images/catalog/studio_beets.jpg',
  '/images/catalog/studio_broccoli.jpg',
  '/images/catalog/studio_cauliflower.jpg',
  '/images/catalog/studio_cherry_tomatoes.jpg',
  '/images/catalog/studio_chilies.jpg',
  '/images/catalog/studio_chives.jpg',
  '/images/catalog/studio_cilantro.jpg',
  '/images/catalog/studio_collard_greens.jpg',
  '/images/catalog/studio_dill.jpg',
  '/images/catalog/studio_garlic.jpg',
  '/images/catalog/studio_green_beans.jpg',
  '/images/catalog/studio_honeydew.jpg',
  '/images/catalog/studio_kumquats.jpg',
  '/images/catalog/studio_lavender.jpg',
  '/images/catalog/studio_lettuce.jpg',
  '/images/catalog/studio_mint.jpg',
  '/images/catalog/studio_okra.jpg',
  '/images/catalog/studio_onions.jpg',
  '/images/catalog/studio_oregano.jpg',
  '/images/catalog/studio_parsley.jpg',
  '/images/catalog/studio_passionfruit.jpg',
  '/images/catalog/studio_radishes.jpg',
  '/images/catalog/studio_rosemary.jpg',
  '/images/catalog/studio_sage.jpg',
  '/images/catalog/studio_snap_peas.jpg',
  '/images/catalog/studio_sweet_corn.jpg',
  '/images/catalog/studio_sweet_potatoes.jpg',
  '/images/catalog/studio_swiss_chard.jpg',
  '/images/catalog/studio_tangerines.jpg',
  '/images/catalog/studio_thyme.jpg',
  '/images/catalog/studio_yellow_squash.jpg',
  '/images/catalog/studio_zinnias.jpg',
]

/** Simple deterministic hash function for date strings YYYY-MM-DD with multi-year seed mixing */
function getDayHash(dateStr: string): number {
  const parts = dateStr.split('-')
  const year = parseInt(parts[0], 10) || 2026
  const month = parseInt(parts[1], 10) || 1
  const day = parseInt(parts[2], 10) || 1

  const now = new Date(year, month - 1, day)
  const start = new Date(year, 0, 0)
  const diff = now.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay)

  // Multi-year hash seed so year 2026 vs 2027 produces a brand new sequence!
  return (year * 365 + dayOfYear * 17) % 10000
}

/** Date-Seeded Fisher-Yates Scrambler for Crop Anagrams */
function scrambleWord(word: string, seed: number): string {
  const letters = word.toUpperCase().split('')
  let currentSeed = seed
  for (let i = letters.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 9301 + 49297) % 233280
    const j = Math.floor((currentSeed / 233280) * (i + 1))
    const temp = letters[i]
    letters[i] = letters[j]
    letters[j] = temp
  }
  // Ensure not identical to original
  if (letters.join('') === word.toUpperCase()) {
    letters.reverse()
  }
  return letters.join('-')
}

/** Procedural Nutri-Calc Equation Generator */
function generateProceduralNutriCalc(seed: number) {
  const nutrients = [
    { name: 'Avocado', emoji: '🥑', val: 10, unit: 'g Fiber' },
    { name: 'Blueberry', emoji: '🫐', val: 4, unit: 'g Fiber' },
    { name: 'Lemon', emoji: '🍋', val: 2, unit: 'g Fiber' },
    { name: 'Strawberry', emoji: '🍓', val: 3, unit: 'mg Vitamin C' },
    { name: 'Apple', emoji: '🍎', val: 4, unit: 'g Pectin' },
    { name: 'Mango', emoji: '🥭', val: 5, unit: 'g Fiber' },
    { name: 'Carrot', emoji: '🥕', val: 4, unit: 'g Fiber' },
  ]

  const idx1 = seed % nutrients.length
  const idx2 = (seed + 2) % nutrients.length
  const idx3 = (seed + 4) % nutrients.length

  const n1 = nutrients[idx1]
  const n2 = nutrients[idx2]
  const n3 = nutrients[idx3]

  const mult1 = (seed % 3) + 1
  const mult2 = ((seed + 1) % 2) + 1

  const answer = n1.val * mult1 + n2.val * mult2 + n3.val
  const mathStr = `${n1.emoji} ${mult1}x ${n1.name} (${n1.val}) + ${n2.emoji} ${mult2}x ${n2.name} (${n2.val}) + ${n3.emoji} ${n3.name} (${n3.val}) = ?`

  return { answer, mathStr, unit: n1.unit }
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

  // Pick today's 9:16 Jigsaw Image from 74-Studio Asset Pool
  const jigsawImgIdx = (seed * 13) % STUDIO_IMAGE_POOL.length
  const todayJigsawImg = STUDIO_IMAGE_POOL[jigsawImgIdx]

  // Generate today's procedural Nutri-Calc equation
  const nutriCalcData = generateProceduralNutriCalc(seed)

  // Generate today's date-seeded Crop Anagram scramble
  const anagramScrambled = scrambleWord(altCrop.solution, seed)

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
      imageUrl: todayJigsawImg,
    },
    {
      id: `math_${dateStr}`,
      category: 'math',
      categoryName: 'Harvest Nutri-Calc',
      title: "Today's Nutri-Calc",
      subtitle: 'Solve today\'s dietary fiber & Vitamin C equations!',
      difficulty: 'medium',
      rewardPoints: 50,
      mathEquationStr: nutriCalcData.mathStr,
      correctAnswer: nutriCalcData.answer,
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
      anagramText: anagramScrambled,
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
