/**
 * Smart Ad Set Matching & Budget Isolation Engine
 * 
 * Automatically detects whether an existing Meta Ad Set matches the user's
 * exact targeting parameters AND intent/items (Buyer vs Seller vs Game, and Produce List),
 * ensuring independent budget control per produce/intent and preventing audience mixing.
 */

export type AudienceIntent = 'seller' | 'buyer' | 'game'

export interface MetaAdSetRecord {
  id: string
  name: string
  campaign_id?: string
  audience_intent?: AudienceIntent
  items?: string[] // produce item names (e.g. ['lemons']) or game IDs (e.g. ['garden_spell'])
  targeting?: {
    zips?: string[]
    age_min?: number
    age_max?: string | number
    gender?: 'all' | 'women' | 'men'
    interests?: string[]
    radius_miles?: number
  }
  budget_daily_usd?: number
}

export interface TargetingCriteria {
  audienceIntent: AudienceIntent
  items: string[] // produce item names or game IDs
  zips: string[]
  ageMin: number
  ageMax: string | number
  gender: 'all' | 'women' | 'men'
  interests: string[]
  campaignId?: string
}

export interface MatchResult {
  mode: 'existing' | 'new'
  matchedAdSet?: MetaAdSetRecord
  suggestedName: string
  reason: string
  isAutoMatched: boolean
}

/**
 * Normalizes an array of zip codes for accurate comparison.
 */
export function normalizeZips(zips: string[] | string): string[] {
  if (typeof zips === 'string') {
    return zips
      .split(',')
      .map(z => z.trim())
      .filter(Boolean)
      .sort()
  }
  return [...zips].map(z => z.trim()).filter(Boolean).sort()
}

/**
 * Normalizes item names (e.g. ['Meyer Lemons', 'lemons'] -> ['lemons'])
 */
export function normalizeItems(items: string[]): string[] {
  return items
    .map(i => i.toLowerCase().replace(/[^a-z0-9]/g, '_').trim())
    .filter(Boolean)
    .sort()
}

/**
 * Evaluates available ad sets and determines if an existing ad set matches the criteria,
 * or generates a descriptive name for an isolated new ad set with its own budget.
 */
export function resolveSmartAdSet(
  criteria: TargetingCriteria,
  availableAdSets: MetaAdSetRecord[],
  entityPrefix?: string
): MatchResult {
  const normZips = normalizeZips(criteria.zips)
  const normItems = normalizeItems(criteria.items)
  const normInterests = [...criteria.interests].map(i => i.toLowerCase().trim()).sort()
  const intent = criteria.audienceIntent

  const intentCapitalized = intent.charAt(0).toUpperCase() + intent.slice(1)
  const itemsDisplay = criteria.items.length > 0 
    ? (criteria.items.length > 3 
        ? `MultiHarvest_${criteria.items.length}Items` 
        : criteria.items.map(i => i.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join('_'))
    : (entityPrefix || 'Produce')

  // Find an exact or highly compatible matching Ad Set
  for (const adSet of availableAdSets) {
    if (criteria.campaignId && adSet.campaign_id && adSet.campaign_id !== criteria.campaignId) {
      continue
    }

    const nameLower = adSet.name.toLowerCase()

    // 1. Check Intent Match (Must not mix Buyer vs Seller vs Game)
    const adSetIntent: AudienceIntent | undefined = adSet.audience_intent || (
      nameLower.includes('seller') ? 'seller' :
      nameLower.includes('buyer') ? 'buyer' :
      nameLower.includes('game') ? 'game' : undefined
    )

    if (adSetIntent && adSetIntent !== intent) {
      continue // Intent mismatch (e.g. Seller vs Buyer)
    }

    // 2. Check Items / Produce Match (Must not mix Lemons with Avocados)
    const adSetItems = adSet.items ? normalizeItems(adSet.items) : []
    const itemsMatch = (normItems.length === 0 && adSetItems.length === 0) ||
      (adSetItems.length > 0 && normItems.length === adSetItems.length && normItems.every((it, idx) => it === adSetItems[idx])) ||
      (adSetItems.length === 0 && normItems.some(it => nameLower.includes(it)))

    if (!itemsMatch) {
      continue // Different produce item or game -> Must have separate Ad Set and separate budget!
    }

    // 3. Check Geo & Demographic Targeting
    if (!adSet.targeting) {
      const matchesZips = normZips.length === 0 || normZips.some(z => nameLower.includes(z.toLowerCase()))
      const matchesAge = nameLower.includes(`age${criteria.ageMin}`) || nameLower.includes(`${criteria.ageMin}-${criteria.ageMax}`)
      
      if (matchesZips && matchesAge) {
        return {
          mode: 'existing',
          matchedAdSet: adSet,
          suggestedName: adSet.name,
          reason: `Auto-matched: Found existing Ad Set "${adSet.name}" for ${intentCapitalized} (${itemsDisplay}) in ${normZips.join(', ') || 'Nationwide'} sharing this audience budget.`,
          isAutoMatched: true,
        }
      }
      continue
    }

    const setZips = normalizeZips(adSet.targeting.zips || [])
    const setInterests = (adSet.targeting.interests || []).map(i => i.toLowerCase().trim()).sort()
    
    const zipsMatch = (normZips.length === 0 && setZips.length === 0) || 
                      (normZips.length === setZips.length && normZips.every((z, idx) => z === setZips[idx]))

    const ageMinMatch = !adSet.targeting.age_min || adSet.targeting.age_min === criteria.ageMin
    const ageMaxMatch = !adSet.targeting.age_max || String(adSet.targeting.age_max) === String(criteria.ageMax)
    const genderMatch = !adSet.targeting.gender || adSet.targeting.gender === criteria.gender

    const interestsMatch = normInterests.length === 0 || 
                          (setInterests.length > 0 && normInterests.some(i => setInterests.includes(i)))

    if (zipsMatch && ageMinMatch && ageMaxMatch && genderMatch && interestsMatch) {
      return {
        mode: 'existing',
        matchedAdSet: adSet,
        suggestedName: adSet.name,
        reason: `Auto-matched: Sharing budget with existing Ad Set "${adSet.name}" for ${intentCapitalized} ${itemsDisplay} in ${normZips.join(', ') || 'Nationwide'}.`,
        isAutoMatched: true,
      }
    }
  }

  // No existing compatible ad set found -> Generate a new isolated Ad Set with distinct budget
  const zipSnippet = normZips.length > 0 ? (normZips.length > 2 ? `${normZips.slice(0, 2).join('_')}_plus` : normZips.join('_')) : 'Nationwide'
  const cleanAgeMax = String(criteria.ageMax).replace(/\+/g, '')
  const ageSnippet = `Age${criteria.ageMin}-${cleanAgeMax}`
  const genderSnippet = criteria.gender !== 'all' ? `_${criteria.gender}` : ''
  const generatedName = `AdSet_${intentCapitalized}_${itemsDisplay.replace(/\s+/g, '')}_${zipSnippet}_${ageSnippet}${genderSnippet}_10mi`

  const isolationReason = `Creating isolated Ad Set for ${intentCapitalized} [${itemsDisplay}] in [${normZips.join(', ') || 'Nationwide'}] with dedicated budget.`

  return {
    mode: 'new',
    suggestedName: generatedName,
    reason: isolationReason,
    isAutoMatched: false,
  }
}
