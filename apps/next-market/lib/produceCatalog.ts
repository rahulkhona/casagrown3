import { EXHAUSTIVE_INTERESTS_CATALOG, InterestCatalogItem, getInterestImage } from './interestCatalog'

export type ProduceItem = InterestCatalogItem

export const EXHAUSTIVE_US_PRODUCE: ProduceItem[] = EXHAUSTIVE_INTERESTS_CATALOG

export function getProduceImage(name?: string): string {
  return getInterestImage(name)
}

/**
 * Common prefixes, adjectives, and specific variety names to strip
 * when extracting the generalized base produce category.
 */
const DESCRIPTIVE_QUALIFIERS = [
  // General adjectives
  'organic', 'fresh', 'raw', 'backyard', 'homegrown', 'home-grown', 'home', 'grown',
  'sweet', 'wild', 'crisp', 'ripe', 'juicy', 'local', 'garden', 'tree',
  'heirloom', 'baby', 'mini', 'large', 'small', 'heritage', 'unpasteurized',
  // Color adjectives
  'red', 'green', 'yellow', 'black', 'purple', 'white', 'pink', 'golden', 'ruby',
  // Citrus varieties
  'meyer', 'eureka', 'lisbon', 'persian', 'key', 'valencia', 'navel', 'blood', 'cara cara',
  // Avocado varieties
  'hass', 'haas', 'fuerte', 'bacon', 'gwen', 'reed', 'zutano',
  // Fig varieties
  'mission', 'black mission', 'brown turkey', 'kadota', 'calimyrna',
  // Apple & Pear varieties
  'fuji', 'gala', 'honeycrisp', 'granny smith', 'pink lady', 'mcintosh', 'bartlett', 'bosc', 'anjou', 'asian',
  // Tomato varieties
  'cherry', 'roma', 'beefsteak', 'san marzano', 'cherokee', 'cherokee purple', 'brandywine', 'grape', 'heritage',
  // Pepper varieties
  'bell', 'sweet bell', 'hot', 'jalapeno', 'habanero', 'serrano', 'poblano', 'ghost', 'thai chili', 'cayenne',
  // Squash & Melon varieties
  'summer', 'winter', 'globe', 'italian', 'japanese', 'sugar',
  // Herb varieties
  'genovese', 'thai', 'holy', 'curly', 'flat leaf', 'italian parsley', 'spearmint', 'peppermint',
  // Egg & Honey descriptors
  'pastured', 'free range', 'farm', 'cage free', 'wildflower', 'clover', 'raw wildflower'
]

/**
 * Extracts the generalized Base Produce item from ANY raw string or variety.
 * E.g. "Meyer Lemons" -> "Lemons"
 *      "Organic Hass Avocados" -> "Avocados"
 *      "Cherokee Purple Tomatoes" -> "Tomatoes"
 *      "Fresh Genovese Basil" -> "Basil"
 *      "Black Mission Figs" -> "Figs"
 */
import { checkTextForViolations } from './moderation'

const PROCESSED_NON_HARVEST_REGEX = /\b(pie|tart|cake|bread|focaccia|sourdough|pastry|cookie|jam|jelly|canned|soup|salsa|pickle|meal|sandwich|baked|loaf|loaves|muffin|cupcake|brownie|candy|chocolate|pizza|burger|snack)\b/i

export function isRawHarvestProduce(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  return !PROCESSED_NON_HARVEST_REGEX.test(name)
}

export interface ProduceCategoryMatch {
  isValid: boolean
  name: string
  category: 'produce' | 'herbs' | 'flowers' | 'flower_arrangements' | 'garden_equipment' | 'pots' | 'soil' | 'seeds' | 'honey' | 'eggs' | 'seedlings' | 'plants'
  displayCategory: 'Citrus' | 'Vegetables' | 'Fruit' | 'Herbs' | 'Flowers' | 'Flower Arrangements' | 'Garden Equipment' | 'Pots & Planters' | 'Soil & Compost' | 'Seeds' | 'Honey & Eggs' | 'Starter Plants'
}

const CITRUS_REGEX = /\b(lemon|lemons|meyer|lime|limes|key lime|persian lime|orange|oranges|valencia|navel|blood orange|cara cara|grapefruit|mandarin|mandarins|satsuma|clementine|tangerine|tangerines|kumquat|kumquats|pomelo|pomelos|yuzu|bergamot|calamansi|tangelo|citron)\b/i
const FRUIT_REGEX = /\b(sitafal|sitaphal|custard apple|sugar apple|cherimoya|soursop|atemoya|avocado|avocados|fig|figs|persimmon|persimmons|pomegranate|pomegranates|peach|peaches|nectarine|nectarines|plum|plums|plumcot|pluot|cherry|cherries|apple|apples|pear|pears|strawberry|strawberries|blueberry|blueberries|blackberry|blackberries|raspberry|raspberries|mulberry|mulberries|watermelon|cantaloupe|honeydew|grape|grapes|mango|mangoes|passionfruit|passion fruit|guava|guavas|dragonfruit|dragon fruit|pitaya|papaya|papayas|apricot|apricots|loquat|loquats|jujube|jujubes|feijoa|kiwi|kiwifruit|starfruit|lychee|longan|rambutan|jackfruit|tamarind|sapote|quince|breadfruit|gooseberry|elderberry|currant|currants)\b/i
const VEGETABLE_REGEX = /\b(tomato|tomatoes|tomatillo|tomatillos|pepper|peppers|chili|chilies|chile|chiles|jalapeno|habanero|serrano|poblano|cucumber|cucumbers|zucchini|squash|pumpkin|pumpkins|eggplant|eggplants|bean|beans|pea|peas|edamame|kale|collard|mustard greens|chard|lettuce|arugula|spinach|bok choy|pak choi|cabbage|broccoli|broccolini|cauliflower|brussels sprout|brussels sprouts|kohlrabi|carrot|carrots|beet|beets|radish|radishes|daikon|turnip|turnips|rutabaga|parsnip|parsnips|potato|potatoes|sweet potato|sweet potatoes|yam|yams|onion|onions|scallion|scallions|green onion|leek|leeks|shallot|shallots|garlic|corn|maize|okra|asparagus|artichoke|artichokes|celery|fennel|ginger|turmeric|horseradish|sunchoke|tatsoi|watercress)\b/i
const HERB_REGEX = /\b(basil|mint|spearmint|peppermint|rosemary|thyme|parsley|cilantro|coriander|culantro|oregano|sage|chives|dill|lavender|tarragon|lemongrass|marjoram|savory|bay leaf|bay leaves|curry leaves|fenugreek|methi|epazote|sorrel|borage|chervil|stevia|shiso|perilla|lovage|tulsi)\b/i
const FLOWER_REGEX = /\b(flower|flowers|sunflower|sunflowers|dahlia|dahlias|zinnia|zinnias|marigold|marigolds|nasturtium|nasturtiums|rose|roses|chamomile|calendula|pansy|pansies|viola|violas|cornflower|snapdragon|cosmos|peony|peonies|hibiscus|sweet pea|echinacea|carnation|tulip|tulips|orchid|orchids|geranium|geraniums)\b/i
const FLOWER_ARRANGEMENT_REGEX = /\b(bouquets?|flower arrangements?|floral arrangements?|vase arrangements?|centerpieces?)\b/i
const POTS_PLANTERS_REGEX = /\b(pots?|wooden pots?|planters?|planter box(es)?|raised beds?|terracotta|ceramic pots?|nursery pots?|grow bags?|containers?|flower pots?)\b/i
const GARDEN_EQUIPMENT_REGEX = /\b(tools?|equipments?|garden tools?|garden equipments?|shovels?|spades?|trowels?|shears|pruners?|clippers?|rakes?|hoes?|hoses?|watering cans?|sprayers?|trellis(es)?|stakes?|garden netting|gardening gloves|gloves|wheelbarrows?|loppers?|aerators?)\b/i
const SOIL_COMPOST_REGEX = /\b(soil|potting soil|potting mix|compost|mulch|dirt|topsoil|worm castings?|perlite|vermiculite|peat moss|fertilizer|organic fertilizer|bone meal|manure|soil amendment)\b/i
const SEEDS_REGEX = /\b(seeds?|seed packets?|seed pods?|heirloom seeds?)\b/i
const HONEY_EGG_REGEX = /\b(honey|honeycomb|bee pollen|propolis|egg|eggs)\b/i
const STARTER_PLANT_REGEX = /\b(seedling|seedlings|sapling|saplings|starter plant|starter plants|cutting|cuttings|rootstock|plant start|seed start|nursery plant|nursery starts)\b/i

/**
 * Validates whether a raw name belongs to one of CasaGrown's valid sales categories.
 * Returns null if the item is banned, cooked/processed food, or not a recognized garden category.
 */
export function categorizeProduce(rawName: string): ProduceCategoryMatch | null {
  if (!rawName || typeof rawName !== 'string') return null
  const clean = rawName.trim().toLowerCase()
  if (clean.length < 2 || clean.length > 60) return null

  // 1. Content Moderation / Banned Terms Check
  const modCheck = checkTextForViolations(clean)
  if (!modCheck.isClean) return null

  // 2. Raw Harvest / Non-processed food check
  if (!isRawHarvestProduce(clean)) return null

  // 3. Exact or qualifier match in base catalog
  const catalogMatch = EXHAUSTIVE_INTERESTS_CATALOG.find(
    i => i.name.toLowerCase() === clean || i.id.toLowerCase().replace(/[_-]/g, ' ') === clean
  )
  if (catalogMatch) {
    return {
      isValid: true,
      name: catalogMatch.name,
      category: catalogMatch.category as any,
      displayCategory: catalogMatch.displayCategory as any,
    }
  }

  // 4. Canonical sales_categories matching
  if (POTS_PLANTERS_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'pots', displayCategory: 'Pots & Planters' }
  }
  if (SOIL_COMPOST_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'soil', displayCategory: 'Soil & Compost' }
  }
  if (GARDEN_EQUIPMENT_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'garden_equipment', displayCategory: 'Garden Equipment' }
  }
  if (SEEDS_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'seeds', displayCategory: 'Seeds' }
  }
  if (FLOWER_ARRANGEMENT_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'flower_arrangements', displayCategory: 'Flower Arrangements' }
  }
  if (CITRUS_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'produce', displayCategory: 'Citrus' }
  }
  if (FRUIT_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'produce', displayCategory: 'Fruit' }
  }
  if (VEGETABLE_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'produce', displayCategory: 'Vegetables' }
  }
  if (HERB_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'herbs', displayCategory: 'Herbs' }
  }
  if (FLOWER_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'flowers', displayCategory: 'Flowers' }
  }
  if (HONEY_EGG_REGEX.test(clean)) {
    const isEgg = /\beggs?\b/i.test(clean)
    return { isValid: true, name: rawName.trim(), category: isEgg ? 'eggs' : 'honey', displayCategory: 'Honey & Eggs' }
  }
  if (STARTER_PLANT_REGEX.test(clean)) {
    return { isValid: true, name: rawName.trim(), category: 'seedlings', displayCategory: 'Starter Plants' }
  }

  return null
}

/**
 * Extracts the generalized Base Produce item from ANY raw string or variety.
 */
export function extractBaseProduce(rawName: string): InterestCatalogItem {
  if (!rawName || typeof rawName !== 'string') {
    return {
      id: 'vegetables',
      name: 'Fresh Produce',
      category: 'produce',
      displayCategory: 'Vegetables',
      image: '/products/heritage-tomatoes.png',
      buyersCount: 10,
      sellersCount: 5,
      unit: 'item'
    }
  }

  let cleaned = rawName.toLowerCase().trim().replace(/[_-]/g, ' ')

  // 1. Direct match in canonical catalog
  const exact = EXHAUSTIVE_INTERESTS_CATALOG.find(
    i => i.name.toLowerCase() === cleaned || i.id.toLowerCase().replace(/[_-]/g, ' ') === cleaned
  )
  if (exact) return exact

  // 2. Strip known qualifiers iteratively
  for (const q of DESCRIPTIVE_QUALIFIERS) {
    const regex = new RegExp(`\\b${q}\\b`, 'gi')
    cleaned = cleaned.replace(regex, ' ').replace(/\s+/g, ' ').trim()
  }

  // 3. Match against cleaned string
  if (cleaned.length > 0) {
    const cleanedExact = EXHAUSTIVE_INTERESTS_CATALOG.find(
      i => i.name.toLowerCase() === cleaned || i.id.toLowerCase().replace(/[_-]/g, ' ') === cleaned
    )
    if (cleanedExact) return cleanedExact

    const substringMatch = EXHAUSTIVE_INTERESTS_CATALOG.find(
      i => i.name.toLowerCase().includes(cleaned) ||
           cleaned.includes(i.name.toLowerCase()) ||
           i.id.replace(/[_-]/g, ' ').includes(cleaned) ||
           cleaned.includes(i.id.replace(/[_-]/g, ' '))
    )
    if (substringMatch) return substringMatch

    const words = cleaned.split(/\s+/)
    const lastWord = words[words.length - 1]
    const rootMatch = EXHAUSTIVE_INTERESTS_CATALOG.find(
      i => i.name.toLowerCase().includes(lastWord) ||
           lastWord.includes(i.name.toLowerCase()) ||
           i.id.includes(lastWord) ||
           lastWord.includes(i.id)
    )
    if (rootMatch) return rootMatch
  }

  // 4. Also scan original string for any base produce keyword present
  const baseMatch = EXHAUSTIVE_INTERESTS_CATALOG.find(
    i => rawName.toLowerCase().includes(i.name.toLowerCase()) ||
         rawName.toLowerCase().includes(i.id.replace(/[_-]/g, ' '))
  )
  if (baseMatch) return baseMatch

  // 5. Categorize custom produce into valid category
  const categoryMatch = categorizeProduce(rawName)
  const finalName = (cleaned || rawName).trim().replace(/\b\w/g, l => l.toUpperCase())

  return {
    id: finalName.toLowerCase().replace(/\s+/g, '_'),
    name: finalName,
    category: categoryMatch?.category || 'produce',
    displayCategory: categoryMatch?.displayCategory || 'Vegetables',
    image: '/images/produce_placeholder.jpg',
    buyersCount: 1,
    sellersCount: 1,
    unit: 'item'
  }
}

/**
 * Returns a list of broad family/category names for a produce item name.
 */
export function getProduceFamilies(name: string): string[] {
  if (!name) return []
  const normalized = name.toLowerCase().trim()
  const base = extractBaseProduce(name)
  
  const families = new Set<string>()
  families.add(normalized)
  families.add(base.name.toLowerCase())
  families.add(base.id.toLowerCase().replace(/[_-]/g, ' '))
  
  if (base.category) families.add(base.category.toLowerCase())
  if (base.displayCategory) families.add(base.displayCategory.toLowerCase())

  // Also add singular/plural variations of the base name
  const baseLower = base.name.toLowerCase()
  if (baseLower.endsWith('s')) {
    families.add(baseLower.slice(0, -1))
  } else {
    families.add(baseLower + 's')
  }

  return Array.from(families)
}
