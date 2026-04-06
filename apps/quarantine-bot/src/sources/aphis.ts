// ============================================================================
// USDA APHIS Source — national pest quarantine data
// Scrapes known APHIS pest program pages for quarantined states/counties.
// ============================================================================

import * as cheerio from 'cheerio';
import type { RawQuarantineRecord } from '../types.js';
import type { HealthLogger } from '../lib/health-logger.js';

const SOURCE_NAME = 'USDA_APHIS';

/** Configuration for each APHIS pest page we scrape */
interface AphisPestConfig {
  pest_name: string;
  url: string;
  /** CSS selectors and parsing hints — the fragile part we monitor */
  selectors: {
    /** Selector for the main content area containing state/county data */
    content: string;
    /** Alternative selectors to try if primary fails */
    fallbacks: string[];
  };
  /** Expected minimum number of states to find (sanity check) */
  expected_min_states: number;
}

const PEST_CONFIGS: AphisPestConfig[] = [
  {
    pest_name: 'Spotted Lanternfly',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/slf',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 5,
  },
  {
    pest_name: 'Emerald Ash Borer',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/eab',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 5,
  },
  {
    pest_name: 'Asian Longhorned Beetle',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/alb',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 2,
  },
  {
    pest_name: 'Imported Fire Ant',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/ifa',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 5,
  },
  {
    pest_name: 'Citrus Diseases',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/citrus-diseases',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 3,
  },
  {
    pest_name: 'Spongy Moth',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/spongy-moth',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 5,
  },
  {
    pest_name: 'Fruit Flies',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/fruit-flies',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 2,
  },
  {
    pest_name: 'Karnal Bunt',
    url: 'https://www.aphis.usda.gov/plant-pests-diseases/karnal-bunt',
    selectors: {
      content: 'main, article, .field--name-body, #block-aphis-content',
      fallbacks: ['.main-content', '#content', 'body'],
    },
    expected_min_states: 1,
  },
];

// US state name → code lookup
const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR',
};

const STATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODES).map(([name, code]) => [
    code,
    name.replace(/\b\w/g, (c) => c.toUpperCase()),
  ]),
);

// All state names for regex matching
const ALL_STATE_NAMES = Object.keys(STATE_CODES).map(
  (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
);

/**
 * Fetch quarantine data from all configured APHIS pest pages.
 */
export async function fetchAPHIS(health: HealthLogger): Promise<RawQuarantineRecord[]> {
  health.startSource(SOURCE_NAME);
  const startTime = Date.now();
  const allRecords: RawQuarantineRecord[] = [];

  for (const config of PEST_CONFIGS) {
    try {
      console.log(`  📡 APHIS: Fetching ${config.pest_name}...`);
      const records = await fetchPestPage(config, health);
      allRecords.push(...records);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      health.recordWarning(SOURCE_NAME, `${config.pest_name}: ${msg}`);
    }
  }

  health.finishSource(SOURCE_NAME, allRecords.length, Date.now() - startTime);
  console.log(`  ✅ APHIS: ${allRecords.length} records fetched in ${Date.now() - startTime}ms`);

  return allRecords;
}

/**
 * Fetch and parse a single APHIS pest page.
 */
async function fetchPestPage(
  config: AphisPestConfig,
  health: HealthLogger,
): Promise<RawQuarantineRecord[]> {
  const resp = await fetch(config.url, {
    headers: {
      'User-Agent': 'CasaGrown-QuarantineBot/1.0 (agricultural-data-aggregation)',
      Accept: 'text/html',
    },
  });

  if (!resp.ok) {
    health.recordSchemaIssue(SOURCE_NAME, {
      severity: 'ERROR',
      field: `page_${config.pest_name}`,
      message: `HTTP ${resp.status} fetching ${config.url}. Page may have moved or been restructured.`,
      expected: '200',
      actual: String(resp.status),
    });
    return [];
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Validate we can find content with our selectors
  let contentEl = $(config.selectors.content).first();

  if (contentEl.length === 0) {
    // Try fallback selectors
    for (const fallback of config.selectors.fallbacks) {
      contentEl = $(fallback).first();
      if (contentEl.length > 0) {
        health.recordSchemaIssue(SOURCE_NAME, {
          severity: 'WARNING',
          field: `selector_${config.pest_name}`,
          message: `Primary selector "${config.selectors.content}" failed, fell back to "${fallback}". Page structure may have changed.`,
          expected: config.selectors.content,
          actual: fallback,
        });
        break;
      }
    }

    if (contentEl.length === 0) {
      health.recordSchemaIssue(SOURCE_NAME, {
        severity: 'ERROR',
        field: `selector_${config.pest_name}`,
        message: `No content found with any selector for ${config.pest_name}. Page has been restructured.`,
      });
      return [];
    }
  }

  const pageText = contentEl.text();

  // Strategy 1: Parse table rows for state/county data
  const tableRecords = parseTablesForStates($, config, health);

  // Strategy 2: Parse text content for state name mentions
  const textRecords = parseTextForStates(pageText, config);

  // Use table records if found, otherwise fall back to text extraction
  const records = tableRecords.length > 0 ? tableRecords : textRecords;

  // Validate we found a reasonable number
  if (records.length === 0) {
    health.recordSchemaIssue(SOURCE_NAME, {
      severity: 'ERROR',
      field: `records_${config.pest_name}`,
      message: `Zero states/counties extracted from ${config.pest_name} page. Parser may be broken or page format changed.`,
      expected: `>= ${config.expected_min_states} states`,
      actual: '0',
    });
  } else if (records.length < config.expected_min_states) {
    health.recordSchemaIssue(SOURCE_NAME, {
      severity: 'WARNING',
      field: `records_${config.pest_name}`,
      message: `Fewer states than expected for ${config.pest_name}: found ${records.length}, expected >= ${config.expected_min_states}. Some data may be missing.`,
      expected: String(config.expected_min_states),
      actual: String(records.length),
    });
  }

  return records;
}

/**
 * Parse HTML tables for state/county quarantine data.
 */
function parseTablesForStates(
  $: any,
  config: AphisPestConfig,
  health: HealthLogger,
): RawQuarantineRecord[] {
  const records: RawQuarantineRecord[] = [];

  $('table').each((_tableIndex: any, table: any) => {
    const rows = $(table).find('tr');

    rows.each((_rowIndex: any, row: any) => {
      const cells = $(row).find('td, th');
      const rowText = cells
        .map((_i: any, c: any) => $(c).text().trim())
        .get()
        .join(' ');

      // Look for state names in each row
      for (const stateName of ALL_STATE_NAMES) {
        if (rowText.includes(stateName)) {
          const stateCode = STATE_CODES[stateName.toLowerCase()];
          if (!stateCode) continue;

          // Try to extract county from neighboring cells
          const countyName = extractCountyFromRow(cells, $);

          records.push({
            notes: `USDA APHIS ${config.pest_name} quarantine`,
            pest_name: config.pest_name,
            state_code: stateCode,
            state_name: stateName,
            county_name: countyName,
            starts_at: null,
            ends_at: null,
            source_url: config.url,
            is_active: true,
            data_source: SOURCE_NAME,
            confidence: 'MEDIUM',
          });
        }
      }
    });
  });

  // Deduplicate by state within this pest
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.state_code}|${r.county_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Parse page text for state name mentions (fallback when no tables found).
 */
function parseTextForStates(
  text: string,
  config: AphisPestConfig,
): RawQuarantineRecord[] {
  const records: RawQuarantineRecord[] = [];
  const seen = new Set<string>();

  for (const stateName of ALL_STATE_NAMES) {
    // Use word boundary matching to avoid false positives
    const regex = new RegExp(`\\b${escapeRegex(stateName)}\\b`, 'gi');
    if (regex.test(text)) {
      const stateCode = STATE_CODES[stateName.toLowerCase()];
      if (!stateCode || seen.has(stateCode)) continue;
      seen.add(stateCode);

      records.push({
        notes: `USDA APHIS ${config.pest_name} — state mentioned in program page`,
        pest_name: config.pest_name,
        state_code: stateCode,
        state_name: stateName,
        county_name: '',
        starts_at: null,
        ends_at: null,
        source_url: config.url,
        is_active: true,
        data_source: SOURCE_NAME,
        confidence: 'LOW',
      });
    }
  }

  return records;
}

/**
 * Try to extract a county name from table row cells.
 */
function extractCountyFromRow(
  cells: any,
  $: any,
): string {
  // Look for cells that contain "County" or a known pattern
  let county = '';
  cells.each((_i: any, cell: any) => {
    const text = $(cell).text().trim();
    const countyMatch = text.match(/(\w[\w\s]*?)\s+County/i);
    if (countyMatch && !county) {
      county = countyMatch[1].trim();
    }
  });
  return county;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
