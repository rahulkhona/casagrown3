// ============================================================================
// CDFA ArcGIS Source — California quarantine boundaries
// Queries the public CDFA FeatureServer for active quarantine zones.
// ============================================================================

import type { RawQuarantineRecord } from '../types.js';
import type { HealthLogger } from '../lib/health-logger.js';

const SOURCE_NAME = 'CDFA_ARCGIS';
const BASE_URL =
  'https://services2.arcgis.com/rFh2EpMO892UxQuz/arcgis/rest/services/Quarantine_Boundaries_view_layer_for_public_use/FeatureServer/0';
const SOURCE_URL = 'https://data.ca.gov/dataset/quarantine-boundaries-view-layer-for-public';

const PAGE_SIZE = 1000;

// ─── Expected schema ───────────────────────────────────────────────
// These are the fields we rely on. If they disappear, the code breaks.
const EXPECTED_FIELDS = [
  'FID',
  'PDR_NUMBER',
  'QB_STATUS',
  'PROJECT_NA',
  'ORGANISM',
  'QB_TYPE',
  'ACTIVE_DAT',
  'COMPLETED_',
  'CREATED_DA',
  'APPROVED_D',
  'SUPERSD_DA',
  'SUPERSD_BY',
  'ADDITIONAL',
  'AREA_SQMI',
  'AREA_SQMI_',
  'GLOBALID',
  'PRIOR',
];

// Expected organism codes from the domain
const EXPECTED_ORGANISMS = [
  'Asian Citrus Psyllid',
  'Curly Top Virus',
  'Diaprepes Root Weevil',
  'European Grape Vine Moth',
  'guava fruit fly',
  'gypsy moth',
  'HLB',
  'Karnal Blunt',
  'Light Brown Apple Moth',
  'MalFF',
  'Mediterranean fruit fly',
  'Melon fruit fly',
  'Mexican fruit fly',
  'oriental fruit fly',
  'peach fruit fly',
  'Queensland fruit fly',
  'Spotted lanternfly',
  'Sweet orange scab',
  'White Striped Fruit Fly',
  'Zeugodacus Tau',
  'CYVCV',
  'Caribbean fruit fly',
];

// Map organism codes to human-readable names (for cases where the code differs)
const ORGANISM_DISPLAY_NAMES: Record<string, string> = {
  HLB: 'Huanglongbing (Citrus Greening)',
  MalFF: 'Malaysian Fruit Fly',
  CYVCV: 'Citrus Yellow Vein Clearing Virus',
};

// CA county names — used for parsing PROJECT_NA
const CA_COUNTIES = [
  'Alameda', 'Alpine', 'Amador', 'Butte', 'Calaveras', 'Colusa',
  'Contra Costa', 'Del Norte', 'El Dorado', 'Fresno', 'Glenn', 'Humboldt',
  'Imperial', 'Inyo', 'Kern', 'Kings', 'Lake', 'Lassen', 'Los Angeles',
  'Madera', 'Marin', 'Mariposa', 'Mendocino', 'Merced', 'Modoc', 'Mono',
  'Monterey', 'Napa', 'Nevada', 'Orange', 'Placer', 'Plumas', 'Riverside',
  'Sacramento', 'San Benito', 'San Bernardino', 'San Diego', 'San Francisco',
  'San Joaquin', 'San Luis Obispo', 'San Mateo', 'Santa Barbara', 'Santa Clara',
  'Santa Cruz', 'Shasta', 'Sierra', 'Siskiyou', 'Solano', 'Sonoma',
  'Stanislaus', 'Sutter', 'Tehama', 'Trinity', 'Tulare', 'Tuolumne',
  'Ventura', 'Yolo', 'Yuba',
];

/**
 * Fetch all active quarantine records from the CDFA ArcGIS FeatureServer.
 */
export async function fetchCDFA(health: HealthLogger): Promise<RawQuarantineRecord[]> {
  health.startSource(SOURCE_NAME);
  const startTime = Date.now();
  const records: RawQuarantineRecord[] = [];

  try {
    // First, fetch the service metadata to validate schema
    await validateSchema(health);

    // Then fetch all active records with pagination
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${BASE_URL}/query`);
      url.searchParams.set('where', "QB_STATUS='A'");
      url.searchParams.set('outFields', '*');
      url.searchParams.set('resultOffset', String(offset));
      url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
      url.searchParams.set('f', 'pjson');
      // Don't fetch geometry — we don't need it, saves bandwidth
      url.searchParams.set('returnGeometry', 'false');

      console.log(`  📡 CDFA: Fetching page at offset ${offset}...`);
      const resp = await fetch(url.toString());

      if (!resp.ok) {
        health.recordError(SOURCE_NAME, `HTTP ${resp.status}: ${resp.statusText}`);
        break;
      }

      const data = await resp.json() as Record<string, unknown>;

      // Validate response structure
      if (!health.validateResponseStructure(SOURCE_NAME, data, ['features', 'fields'])) {
        health.recordError(SOURCE_NAME, 'Response missing "features" or "fields" — cannot parse.');
        break;
      }

      const features = data.features as Array<{ attributes: Record<string, unknown> }>;

      if (!features || features.length === 0) {
        hasMore = false;
        break;
      }

      for (const feature of features) {
        const attr = feature.attributes;
        const record = parseFeature(attr, health);
        if (record) records.push(record);
      }

      // ArcGIS signals more data with exceededTransferLimit
      hasMore = (data.exceededTransferLimit === true) && features.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    // Validate record count is within expected bounds
    // CDFA typically has 5–100 active quarantine boundaries
    health.validateRecordCount(SOURCE_NAME, records.length, 3, 500);

    health.finishSource(SOURCE_NAME, records.length, Date.now() - startTime);
    console.log(`  ✅ CDFA: ${records.length} records fetched in ${Date.now() - startTime}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    health.recordError(SOURCE_NAME, `Fetch failed: ${msg}`);
    health.finishSource(SOURCE_NAME, records.length, Date.now() - startTime);
  }

  return records;
}

/**
 * Validates the schema of the CDFA FeatureServer against our expectations.
 */
async function validateSchema(health: HealthLogger): Promise<void> {
  try {
    const url = `${BASE_URL}?f=pjson`;
    const resp = await fetch(url);
    if (!resp.ok) {
      health.recordWarning(SOURCE_NAME, `Schema check failed: HTTP ${resp.status}`);
      return;
    }

    const meta = await resp.json() as Record<string, unknown>;
    const fields = meta.fields as Array<{ name: string; domain?: { codedValues?: Array<{ code: string }> } }>;

    if (!fields) {
      health.recordSchemaIssue(SOURCE_NAME, {
        severity: 'ERROR',
        field: 'fields',
        message: 'Service metadata missing "fields" array. API structure may have changed.',
      });
      return;
    }

    // Validate field names
    const fieldNames = fields.map((f) => f.name);
    health.validateArcGISFields(SOURCE_NAME, fieldNames, EXPECTED_FIELDS);

    // Validate organism domain
    const organismField = fields.find((f) => f.name.toUpperCase() === 'ORGANISM');
    if (organismField?.domain?.codedValues) {
      const codes = organismField.domain.codedValues.map((cv) => cv.code);
      health.validateCodedDomain(SOURCE_NAME, 'ORGANISM', codes, EXPECTED_ORGANISMS);
    } else {
      health.recordSchemaIssue(SOURCE_NAME, {
        severity: 'WARNING',
        field: 'ORGANISM',
        message: 'ORGANISM field missing coded domain — cannot validate organism types.',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    health.recordWarning(SOURCE_NAME, `Schema validation failed: ${msg}`);
  }
}

/**
 * Parse a single ArcGIS feature into a RawQuarantineRecord.
 */
function parseFeature(
  attr: Record<string, unknown>,
  health: HealthLogger,
): RawQuarantineRecord | null {
  const rawOrganism = String(attr.ORGANISM || '');
  if (!rawOrganism) {
    health.recordWarning(SOURCE_NAME, `Record FID=${attr.FID} has no ORGANISM — skipping.`);
    return null;
  }

  const projectName = String(attr.PROJECT_NA || '');
  const countyName = extractCountyName(projectName);

  if (!countyName) {
    health.recordWarning(
      SOURCE_NAME,
      `Record FID=${attr.FID} — could not extract county from PROJECT_NA="${projectName}".`,
    );
  }

  // Resolve organism display name
  const pestName = ORGANISM_DISPLAY_NAMES[rawOrganism] || rawOrganism;

  // Parse dates (ArcGIS returns epoch milliseconds)
  const startsAt = parseEpochDate(attr.ACTIVE_DAT);
  const endsAt = parseEpochDate(attr.COMPLETED_);

  // Extract area description from project name for reason
  const reason = projectName
    ? `CDFA quarantine — ${projectName}`
    : `CDFA quarantine — ${pestName}`;

  return {
    notes: reason,
    pest_name: pestName,
    state_code: 'CA',
    state_name: 'California',
    county_name: countyName || '',
    starts_at: startsAt,
    ends_at: endsAt,
    source_url: SOURCE_URL,
    is_active: true,
    data_source: SOURCE_NAME,
    confidence: 'HIGH',
  };
}

/**
 * Extract county name from CDFA PROJECT_NA field.
 * Format is typically: "YYYY Pest - County - City" or "YYYY Pest - County/County - City"
 */
function extractCountyName(projectName: string): string {
  if (!projectName) return '';

  // Try splitting on " - " and checking segments against known CA counties
  const parts = projectName.split(/\s*-\s*/);

  for (const part of parts) {
    const trimmed = part.trim();
    // Check for exact county match
    const match = CA_COUNTIES.find(
      (c) => trimmed.toLowerCase().includes(c.toLowerCase()),
    );
    if (match) return match;

    // Check for multi-county format "County/County"
    const subParts = trimmed.split('/');
    for (const sub of subParts) {
      const subMatch = CA_COUNTIES.find(
        (c) => sub.trim().toLowerCase() === c.toLowerCase(),
      );
      if (subMatch) return subMatch;
    }
  }

  return '';
}

/**
 * Parse an ArcGIS epoch-millisecond date field to a JS Date.
 */
function parseEpochDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const ms = Number(value);
  if (Number.isNaN(ms) || ms === 0) return null;
  return new Date(ms);
}
