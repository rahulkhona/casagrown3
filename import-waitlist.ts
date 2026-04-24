import { createClient } from 'npm:@supabase/supabase-js@2';
import { parse } from 'npm:csv-parse/sync';
import { readFileSync } from 'node:fs';

// Replace these with your STAGING project URL and SERVICE ROLE key
// You can get these from your Supabase Dashboard -> Project Settings -> API
const SUPABASE_URL = Deno.env.get('STAGING_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('STAGING_SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Please set STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY environment variables.");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CSV_PATH = `${Deno.env.get('HOME')}/Downloads/waitlist.csv`;

async function main() {
  console.log(`📖 Reading waitlist from ${CSV_PATH}...`);
  
  let csvContent;
  try {
    csvContent = readFileSync(CSV_PATH, 'utf-8');
  } catch (err) {
    console.error(`❌ Could not read file: ${err.message}`);
    Deno.exit(1);
  }

  // Parse CSV (assumes first row is headers)
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`✅ Found ${records.length} records in CSV. Mapping to crm_leads...`);

  const payload = records.map((row) => {
    return {
      name: row.name?.trim() || 'Unknown',
      email: row.email?.trim() || null,
      source_platform: row.referral_source || 'waitlist',
      status: 'new',
      created_at: row.created_at || new Date().toISOString(),
      zipcode: row.zipcode?.trim() || null,
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
