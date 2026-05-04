// ============================================================================
// State ArcGIS Feeds — fetches quarantine data from state-specific ArcGIS endpoints
// Each state's endpoint and field mapping is configured in state-feeds.config.json.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawQuarantineRecord, StateFeedConfig } from '../types.js';
import type { HealthLogger } from '../lib/health-logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PAGE_SIZE = 1000;

/**
 * Load state feed configs from the JSON file.
 */
function loadConfigs(): StateFeedConfig[] {
  const configPath = join(__dirname, 'state-feeds.config.json');
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as StateFeedConfig[];
}

/**
 * Fetch quarantine data from all configured state ArcGIS feeds.
 * Each state is independent — failures in one do not affect others.
 */
export async function fetchStateFeeds(health: HealthLogger): Promise<RawQuarantineRecord[]> {
  const configs = loadConfigs();
  const allRecords: RawQuarantineRecord[] = [];

  for (const config of configs) {
    const sourceName = config.source_name ?? `${config.state_code}_ARCGIS`;
    health.startSource(sourceName);
    const startTime = Date.now();

    try {
      console.log(`  📡 ${config.state_name}: Fetching ArcGIS feed...`);
      const records = await fetchStateFeed(config, sourceName, health);
      allRecords.push(...records);
      health.finishSource(sourceName, records.length, Date.now() - startTime);

      if (records.length > 0) {
        console.log(`  ✅ ${config.state_name}: ${records.length} records in ${Date.now() - startTime}ms`);
      } else {
        console.log(`  ⚪ ${config.state_name}: 0 records (may be expected if endpoint is placeholder)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      health.recordError(sourceName, `Fetch failed: ${msg}`);
      health.finishSource(sourceName, 0, Date.now() - startTime);
      console.log(`  ⚠️  ${config.state_name}: Skipped — ${msg}`);
    }
  }

  return allRecords;
}

/**
 * Fetch quarantine records from a single state's ArcGIS endpoint.
 */
async function fetchStateFeed(
  config: StateFeedConfig,
  sourceName: string,
  health: HealthLogger,
): Promise<RawQuarantineRecord[]> {
  const records: RawQuarantineRecord[] = [];

  // First validate the endpoint is reachable and has expected fields
  const isValid = await validateEndpoint(config, sourceName, health);
  if (!isValid) return records;

  // Fetch active records
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${config.endpoint_url}/query`);
    // presence_only: all features in the layer are active quarantines — no status filter needed
    url.searchParams.set(
      'where',
      config.presence_only ? '1=1' : `${config.field_map.status}='${config.active_status_value}'`,
    );
    url.searchParams.set('outFields', '*');
    url.searchParams.set('resultOffset', String(offset));
    url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('f', 'pjson');

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      health.recordError(sourceName, `HTTP ${resp.status} on query`);
      break;
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const features = data.features as Array<{
      attributes: Record<string, unknown>;
    }>;

    if (!features || features.length === 0) {
      hasMore = false;
      break;
    }

    for (const feature of features) {
      const record = parseStateFeature(feature.attributes, config, sourceName, health);
      if (record) records.push(record);
    }

    hasMore = data.exceededTransferLimit === true && features.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return records;
}

/**
 * Validate that a state endpoint is reachable and has the expected fields.
 */
async function validateEndpoint(
  config: StateFeedConfig,
  sourceName: string,
  health: HealthLogger,
): Promise<boolean> {
  try {
    const url = `${config.endpoint_url}?f=pjson`;
    const resp = await fetch(url);

    if (!resp.ok) {
      health.recordSchemaIssue(sourceName, {
        severity: 'ERROR',
        field: 'endpoint',
        message: `Endpoint returned HTTP ${resp.status}. URL may have changed: ${config.endpoint_url}`,
        expected: '200',
        actual: String(resp.status),
      });
      return false;
    }

    const meta = (await resp.json()) as Record<string, unknown>;

    // Check for ArcGIS error response
    if (meta.error) {
      const error = meta.error as { message?: string; code?: number };
      health.recordSchemaIssue(sourceName, {
        severity: 'ERROR',
        field: 'endpoint',
        message: `ArcGIS error: ${error.message || 'unknown'} (code ${error.code}). Service may have been removed or renamed.`,
      });
      return false;
    }

    // Validate fields exist
    const fields = meta.fields as Array<{ name: string }>;
    if (!fields) {
      health.recordSchemaIssue(sourceName, {
        severity: 'ERROR',
        field: 'fields',
        message: 'No "fields" array in service metadata. Not a valid FeatureServer endpoint.',
      });
      return false;
    }

    const fieldNames = fields.map((f) => f.name.toUpperCase());
    // Only validate non-empty expected fields (presence_only configs have empty status fields)
    const expectedFields = Object.values(config.field_map).filter(Boolean) as string[];
    if (expectedFields.length > 0) {
      health.validateArcGISFields(sourceName, fieldNames, expectedFields.map((f) => f.toUpperCase()));
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    health.recordSchemaIssue(sourceName, {
      severity: 'ERROR',
      field: 'endpoint',
      message: `Cannot reach endpoint: ${msg}. URL may be invalid or service is down.`,
    });
    return false;
  }
}

/**
 * Parse a single state ArcGIS feature into a RawQuarantineRecord.
 */
function parseStateFeature(
  attr: Record<string, unknown>,
  config: StateFeedConfig,
  sourceName: string,
  health: HealthLogger,
): RawQuarantineRecord | null {
  // pest_name_override: pest is implied by the service name (single-pest layers)
  const pestName = config.pest_name_override
    ? config.pest_name_override
    : String(attr[config.field_map.notes_field] || '');

  if (!pestName) {
    health.recordWarning(sourceName, `Record missing pest name — skipping.`);
    return null;
  }

  // county_field: direct county name field bypasses PROJECT_NA parsing
  const countyName = config.field_map.county_field
    ? String(attr[config.field_map.county_field] || '')
    : extractCountyFromProject(
        config.field_map.project_name ? String(attr[config.field_map.project_name] || '') : ''
      );

  if (!countyName) {
    health.recordWarning(sourceName, `Record for "${pestName}" has no county — skipping.`);
    return null;
  }

  const projectName = config.field_map.project_name
    ? String(attr[config.field_map.project_name] || '')
    : '';

  const startsAt = parseEpochDate(attr[config.field_map.active_date]);
  const endsAt = config.field_map.completed_date
    ? parseEpochDate(attr[config.field_map.completed_date])
    : null;

  return {
    notes: `${config.state_name} quarantine — ${pestName} (${countyName} County)`,
    pest_name: pestName,
    state_code: config.state_code,
    state_name: config.state_name,
    county_name: countyName,
    starts_at: startsAt,
    ends_at: endsAt,
    source_url: config.endpoint_url,
    is_active: true,
    data_source: sourceName,
    confidence: 'HIGH',
  };
}

function extractCountyFromProject(projectName: string): string {
  if (!projectName) return '';
  const countyMatch = projectName.match(/(\w[\w\s]*?)\s+County/i);
  return countyMatch ? countyMatch[1].trim() : '';
}

function parseEpochDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const ms = Number(value);
  if (Number.isNaN(ms) || ms === 0) return null;
  return new Date(ms);
}
