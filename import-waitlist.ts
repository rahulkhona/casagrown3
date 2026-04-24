import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CSV_PATH = `${process.env.HOME}/Downloads/waitlist.csv`;

async function main() {
  console.log(`📖 Reading waitlist from ${CSV_PATH}...`);
  
  let csvContent;
  try {
    csvContent = readFileSync(CSV_PATH, 'utf-8');
  } catch (err: any) {
    console.error(`❌ Could not read file: ${err.message}`);
    process.exit(1);
  }

  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`✅ Found ${records.length} records in CSV. Looking up geographic data locally...`);

  // Extract unique zipcodes
  const uniqueZips = Array.from(new Set(records.map((r: any) => r.zipcode?.trim()).filter(Boolean)));
  
  const zipMap: Record<string, { city: string | null, state: string | null, county: string | null, country: string | null }> = {};

  if (uniqueZips.length > 0) {
    const { data: zipData, error: zipError } = await supabase
      .from('zip_codes')
      .select(`
        zip_code,
        cities(name, states(code, country_iso_3)),
        counties(name)
      `)
      .in('zip_code', uniqueZips);

    if (zipError) {
      console.error("❌ Failed to lookup zip codes:", zipError);
      process.exit(1);
    }

    if (zipData) {
      for (const z of zipData as any[]) {
        zipMap[z.zip_code] = {
          city: z.cities?.name || null,
          state: z.cities?.states?.code || null,
          country: z.cities?.states?.country_iso_3 || null,
          county: z.counties?.name || null,
        };
      }
    }
  }

  console.log(`✅ Looked up ${Object.keys(zipMap).length} unique zip codes.`);

  const payload = records.map((row: any) => {
    const zip = row.zipcode?.trim() || null;
    const geo = zip ? (zipMap[zip] || {}) : {};

    return {
      name: row.name?.trim() || 'Unknown',
      email: row.email?.trim() || null,
      source_platform: row.referral_source || 'waitlist',
      status: 'new',
      created_at: row.created_at || new Date().toISOString(),
      zipcode: zip,
      city: geo.city || null,
      state_code: geo.state || null,
      county: geo.county || null,
      country: geo.country || null,
      has_backyard: row.has_backyard === 'TRUE',
      produce_interests: row.produce_interests?.trim() || null,
      device_type: row.device_type || null,
      ip_address: row.ip_address || null
    };
  });

  const escapeSql = (str: string | null | undefined) => {
    if (str === null || str === undefined) return 'NULL';
    return `'${str.replace(/'/g, "''")}'`;
  };

  const escapeBool = (b: boolean) => b ? 'TRUE' : 'FALSE';

  let sql = `-- Migration: Import Waitlist Data
-- Auto-generated from waitlist.csv
INSERT INTO crm_leads (
  name, email, source_platform, status, created_at,
  zipcode, city, state_code, county, country,
  has_backyard, produce_interests, device_type, ip_address
) VALUES
`;

  const values = payload.map((row: any) => {
    return `(
  ${escapeSql(row.name)}, ${escapeSql(row.email)}, ${escapeSql(row.source_platform)}, ${escapeSql(row.status)}, ${escapeSql(row.created_at)},
  ${escapeSql(row.zipcode)}, ${escapeSql(row.city)}, ${escapeSql(row.state_code)}, ${escapeSql(row.county)}, ${escapeSql(row.country)},
  ${escapeBool(row.has_backyard)}, ${escapeSql(row.produce_interests)}, ${escapeSql(row.device_type)}, ${escapeSql(row.ip_address)}
)`;
  });

  sql += values.join(',\n') + '\nON CONFLICT (email) DO NOTHING;\n';

  const migrationPath = 'import_leads.sql';
  writeFileSync(migrationPath, sql);

  console.log(`🚀 Generated SQL migration file: ${migrationPath}`);
}

main();
