// ============================================================================
// CSV Writer — outputs quarantine data to a timestamped CSV file
// ============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { QuarantineZoneRow } from '../types.js';

const CSV_HEADERS: (keyof QuarantineZoneRow)[] = [
  'country_iso_3',
  'state_code',
  'state_name',
  'county_name',
  'city_name',
  'category',
  'produce_category',
  'pest_name',
  'notes',
  'starts_at',
  'ends_at',
  'source_url',
  'is_active',
  'data_source',
  'confidence',
  'scraped_at',
];

/** Escape a CSV field: quote if it contains commas, quotes, or newlines */
function escapeField(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Writes quarantine rows to a timestamped CSV in the given output directory.
 * Returns the full path to the written file.
 */
export function writeQuarantineCsv(
  rows: QuarantineZoneRow[],
  outputDir: string,
): string {
  mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `quarantine_${ts}.csv`;
  const filepath = join(outputDir, filename);

  const headerLine = CSV_HEADERS.join(',');
  const dataLines = rows.map((row) =>
    CSV_HEADERS.map((h) => escapeField(row[h] ?? '')).join(','),
  );

  const content = [headerLine, ...dataLines].join('\n') + '\n';
  writeFileSync(filepath, content, 'utf-8');

  return filepath;
}
