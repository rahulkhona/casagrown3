import { EXHAUSTIVE_US_PRODUCE, ProduceItem, getProduceImage } from './produceCatalog'

export type InterestCatalogItem = ProduceItem

export const EXHAUSTIVE_INTERESTS_CATALOG: InterestCatalogItem[] = EXHAUSTIVE_US_PRODUCE

export function getInterestImage(name?: string): string {
  return getProduceImage(name)
}
