import { EXHAUSTIVE_INTERESTS_CATALOG, InterestCatalogItem, getInterestImage } from './interestCatalog'

export type ProduceItem = InterestCatalogItem

export const EXHAUSTIVE_US_PRODUCE: ProduceItem[] = EXHAUSTIVE_INTERESTS_CATALOG

export function getProduceImage(name?: string): string {
  return getInterestImage(name)
}

/**
 * Returns a list of broad family/category names for a produce item name.
 * Used by the interest list API for fuzzy demand matching:
 * e.g. "Cherry Tomatoes" -> ["cherry tomatoes", "tomatoes", "produce"]
 */
export function getProduceFamilies(name: string): string[] {
  if (!name) return []
  const normalized = name.toLowerCase().trim()
  const found = EXHAUSTIVE_INTERESTS_CATALOG.find(
    p => p.name.toLowerCase() === normalized || p.id === normalized
  )
  const families: string[] = [normalized]
  if (found) {
    // Add the catalog category (e.g. "produce", "herbs", "flowers")
    if (found.category) families.push(found.category.toLowerCase())
    // Add the display category (e.g. "Leafy Greens" -> "leafy greens")
    if (found.displayCategory) families.push(found.displayCategory.toLowerCase())
    // Derive a root family from multi-word names ("cherry tomatoes" -> "tomatoes")
    const words = normalized.split(/\s+/)
    if (words.length > 1) families.push(words[words.length - 1])
  }
  return Array.from(new Set(families))
}
