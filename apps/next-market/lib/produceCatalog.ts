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

    // Check if cleaned string is substring of catalog item or vice versa
    const substringMatch = EXHAUSTIVE_INTERESTS_CATALOG.find(
      i => i.name.toLowerCase().includes(cleaned) ||
           cleaned.includes(i.name.toLowerCase()) ||
           i.id.replace(/[_-]/g, ' ').includes(cleaned) ||
           cleaned.includes(i.id.replace(/[_-]/g, ' '))
    )
    if (substringMatch) return substringMatch

    // Check last word (root noun, e.g. "tomatoes", "peppers", "lemons", "honey")
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

  // 5. Fallback: Title case the cleaned or raw string
  const finalName = (cleaned || rawName).trim().replace(/\b\w/g, l => l.toUpperCase())
  return {
    id: finalName.toLowerCase().replace(/\s+/g, '_'),
    name: finalName,
    category: 'produce',
    displayCategory: 'Vegetables',
    image: '/images/produce_placeholder.jpg',
    buyersCount: 1,
    sellersCount: 1,
    unit: 'item'
  }
}

/**
 * Returns a list of broad family/category names for a produce item name.
 * Used for generalized supply-demand matching.
 * E.g. "Hass Avocados" -> ["hass avocados", "avocados", "fruit", "produce"]
 *      "Meyer Lemons"  -> ["meyer lemons", "lemons", "citrus", "produce"]
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
    families.add(baseLower.slice(0, -1)) // e.g. "lemons" -> "lemon"
  } else {
    families.add(baseLower + 's')       // e.g. "avocado" -> "avocados"
  }

  return Array.from(families)
}
