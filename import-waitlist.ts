import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.STAGING_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Please set STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CSV_PATH = `${process.env.HOME}/Downloads/waitlist.csv`;

async function main() {
  console.log(`📖 Reading waitlist from ${CSV_PATH}...`);
  
  let csvContent;
  try {
    csvContent = readFileSync(CSV_PATH, 'utf-8');
  } catch (err) {
    console.error(`❌ Could not read file: ${err.message}`);
    process.exit(1);
  }

  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`✅ Found ${records.length} records in CSV. Looking up geographic data...`);

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

  console.log(`🚀 Inserting ${payload.length} leads into Supabase staging...`);

  const { data, error } = await supabase
    .from('crm_leads')
    .insert(payload)
    .select('id');

  if (error) {
    console.error("❌ Insertion Failed:", error);
  } else {
    console.log(`🎉 Successfully imported ${data.length} leads!`);
  }
}

main();
