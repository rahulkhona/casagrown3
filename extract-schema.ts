import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as fs from "node:fs";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = new Client("postgres://postgres:postgres@127.0.0.1:54322/postgres");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  await client.connect();

  // 1. Get all tables in public schema
  const tablesRes = await client.queryObject<{table_name: string}>`
    SELECT tablename as table_name 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename ASC;
  `;
  const tables = tablesRes.rows.map(r => r.table_name);

  const tableDetails: any = {};
  for (const t of tables) {
    const colsRes = await client.queryObject<{column_name: string, data_type: string, is_nullable: string, column_default: string}>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${t}
      ORDER BY ordinal_position;
    `;
    tableDetails[t] = colsRes.rows;
  }

  // 2. Get all functions in public schema (excluding trigger functions if possible, but let's just grab all)
  const funcsRes = await client.queryObject<{proname: string, proargnames: string[], proargtypes: any, prorettype: string}>`
    SELECT p.proname, p.proargnames
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname ASC;
  `;
  const functions = Array.from(new Set(funcsRes.rows.map(r => r.proname)));

  // 3. Get all storage buckets
  const { data: bucketsData } = await supabase.storage.listBuckets();
  const buckets = (bucketsData || []).map(b => b.name);

  await client.end();

  // 4. Parse docs/data_model.md
  const mdContent = fs.readFileSync("docs/data_model.md", "utf-8");
  
  const documentedTables = new Set<string>();
  const documentedFunctions = new Set<string>();
  const documentedBuckets = new Set<string>();

  // Extremely basic parsing: looking for `table_name` or #### `table_name`
  // Actually, let's just do a naive check: if the markdown contains the word bounded by backticks or spaces.
  for (const t of tables) {
    if (mdContent.includes(`\`${t}\``) || mdContent.match(new RegExp(`##.*${t}`, 'i'))) {
      documentedTables.add(t);
    }
  }

  for (const f of functions) {
    if (mdContent.includes(`\`${f}\``) || mdContent.includes(f)) {
      documentedFunctions.add(f);
    }
  }

  for (const b of buckets) {
    if (mdContent.includes(`\`${b}\``) || mdContent.includes(b)) {
      documentedBuckets.add(b);
    }
  }

  const IGNORE_PREFIXES = ['st_', '_st_', 'postgis_', '_postgis_', 'box2d', 'box3d', 'bytea', 'geometry', 'geography', 'gml', 'kml', 'geojson', 'topo', 'shp2', 'addauth', 'checkauth', 'pg_'];
  
  const missingTables = tables.filter(t => !documentedTables.has(t) && t !== 'spatial_ref_sys');
  const missingFunctions = functions.filter(f => !documentedFunctions.has(f) && !IGNORE_PREFIXES.some(prefix => f.toLowerCase().startsWith(prefix)));
  const missingBuckets = buckets.filter(b => !documentedBuckets.has(b));

  console.log("Missing Tables:", missingTables);
  console.log("Missing Functions:", missingFunctions);
  console.log("Missing Buckets:", missingBuckets);

  // 5. Generate Markdown
  let appendMd = `\n\n---\n\n## Undocumented / Recently Added Entities\n\n> Auto-generated documentation for schema elements that were missing from the sections above.\n\n`;

  if (missingTables.length > 0) {
    appendMd += `### Tables\n\n`;
    for (const t of missingTables) {
      appendMd += `#### \`${t}\`\n\n| Column | Type | Nullable | Default |\n| :--- | :--- | :--- | :--- |\n`;
      for (const col of tableDetails[t]) {
        appendMd += `| \`${col.column_name}\` | \`${col.data_type}\` | ${col.is_nullable === 'YES' ? 'Yes' : 'No'} | ${col.column_default ? `\`${col.column_default}\`` : ''} |\n`;
      }
      appendMd += `\n`;
    }
  }

  if (missingFunctions.length > 0) {
    appendMd += `### Database Functions\n\n`;
    for (const f of missingFunctions) {
      appendMd += `- \`${f}\`\n`;
    }
    appendMd += `\n`;
  }

  if (missingBuckets.length > 0) {
    appendMd += `### Storage Buckets\n\n`;
    for (const b of missingBuckets) {
      appendMd += `- \`${b}\`\n`;
    }
    appendMd += `\n`;
  }

  if (missingTables.length === 0 && missingFunctions.length === 0 && missingBuckets.length === 0) {
    console.log("Everything is perfectly documented!");
  } else {
    fs.appendFileSync("docs/data_model.md", appendMd);
    console.log("Successfully appended undocumented entities to docs/data_model.md");
  }
}

run().catch(console.error);
