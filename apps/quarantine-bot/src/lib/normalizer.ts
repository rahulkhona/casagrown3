// ============================================================================
// Normalizer — raw records → QuarantineZoneRow for CSV
// ============================================================================

import { format } from 'date-fns';
import type { RawQuarantineRecord, QuarantineZoneRow } from '../types.js';

import { getCachedCategory, setCachedCategory } from './pest-cache.js';
import { askGeminiCategory } from './llm.js';

const SCRAPED_AT = new Date().toISOString();

/** extracts top-level marketplace category from raw notes text */
function extractSalesCategory(notes: string): string {
  if (!notes) return 'produce';
  const note = notes.toLowerCase();
  if (note.match(/fire\s*ant|nematode|root|snail/)) return 'soil';
  if (note.match(/karnal\s*bunt|seed/)) return 'seeds';
  if (note.match(/flower|thrip|aphid/)) return 'flowers';
  if (note.match(/honey|bee/)) return 'honey';
  return 'produce';
}

/** extracts produce mentions from raw notes text */
function extractProduceCategory(notes: string): string {
  if (!notes) return '';
  const note = notes.toLowerCase();
  const found = new Set<string>();
  if (note.match(/citrus|hlb|greening|huanglongbing|sweet\s*orange\s*scab/)) found.add('citrus');
  if (note.match(/fruit\s*fly|melon\s*fly|peach\s*fly|lbam|apple\s*moth/)) found.add('produce');
  if (note.match(/spotted\s*lanternfly|grape\s*vine\s*moth/)) found.add('grapes');
  if (note.match(/karnal\s*bunt/)) found.add('grains');
  if (note.match(/emerald\s*ash|longhorned\s*beetle|spongy\s*moth/)) found.add('trees');
  if (note.match(/fire\s*ant|curly\s*top/)) found.add('plants');
  return Array.from(found).join(', ');
}

/**
 * Converts a raw record from any source into a normalized CSV row.
 */
export async function normalize(raw: RawQuarantineRecord): Promise<QuarantineZoneRow> {
  let category = 'produce';
  let produce_category = extractProduceCategory(raw.notes);

  const cached = getCachedCategory(raw.pest_name);
  if (cached) {
    category = cached.category;
    produce_category = cached.produce_category;
  } else {
    // 1. Try LLM
    const llmRes = await askGeminiCategory(raw.pest_name, raw.notes);
    if (llmRes) {
      category = llmRes.category;
      produce_category = llmRes.produce_category;
      setCachedCategory(raw.pest_name, llmRes);
    } else {
      // 2. Fallback to manual heuristics
      category = extractSalesCategory(raw.notes);
    }
  }

  return {
    country_iso_3: 'USA',
    state_code: raw.state_code,
    state_name: raw.state_name,
    county_name: raw.county_name || '',
    city_name: raw.city_name || '',
    category,
    produce_category,
    pest_name: raw.pest_name,
    notes: raw.notes,
    starts_at: raw.starts_at ? format(raw.starts_at, 'yyyy-MM-dd') : '',
    ends_at: raw.ends_at ? format(raw.ends_at, 'yyyy-MM-dd') : '',
    source_url: raw.source_url,
    is_active: raw.is_active ? 'true' : 'false',
    data_source: raw.data_source,
    confidence: raw.confidence,
    scraped_at: SCRAPED_AT,
  };
}

/**
 * Deduplicates records by (pest_name, state_code, county_name, category).
 * Keeps the highest-confidence record; on tie, keeps earlier starts_at.
 */
export function deduplicate(rows: QuarantineZoneRow[]): QuarantineZoneRow[] {
  const map = new Map<string, QuarantineZoneRow>();

  const confidenceRank: Record<string, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  for (const row of rows) {
    const key = `${row.pest_name}|${row.state_code}|${row.county_name}`.toLowerCase();
    const existing = map.get(key);

    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingRank = confidenceRank[existing.confidence] || 0;
    const newRank = confidenceRank[row.confidence] || 0;

    if (newRank > existingRank) {
      map.set(key, row);
    } else if (newRank === existingRank && row.starts_at < existing.starts_at) {
      map.set(key, row);
    }
  }

  // Sort: state_code ASC, county_name ASC, pest_name ASC
  return Array.from(map.values()).sort((a, b) => {
    if (a.state_code !== b.state_code) return a.state_code.localeCompare(b.state_code);
    if (a.county_name !== b.county_name) return a.county_name.localeCompare(b.county_name);
    return a.pest_name.localeCompare(b.pest_name);
  });
}
