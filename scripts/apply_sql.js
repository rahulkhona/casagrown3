const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const supabase = createClient(
    'http://127.0.0.1:54321',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  const sql = fs.readFileSync(process.argv[2] || 'supabase/migrations/20260320200000_booth_open_toggle.sql', 'utf8');
  
  // Split into individual statements, handling $$ function bodies
  const stmts = [];
  let buf = '';
  let inDollar = false;
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollar) continue;
    if (trimmed === '') continue;
    
    if (trimmed.includes('$$') && !inDollar) {
      inDollar = true;
      buf += line + '\n';
      // Check if $$ appears twice on same line (start+end)
      if ((line.match(/\$\$/g) || []).length >= 2) {
        inDollar = false;
      }
      continue;
    }
    if (trimmed.includes('$$') && inDollar) {
      inDollar = false;
      buf += line + '\n';
      if (trimmed.endsWith(';')) {
        stmts.push(buf.trim());
        buf = '';
      }
      continue;
    }
    
    buf += line + '\n';
    if (!inDollar && trimmed.endsWith(';')) {
      stmts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) stmts.push(buf.trim());

  console.log(`Found ${stmts.length} statements`);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    
    try {
      const { error } = await supabase.rpc('_exec_sql', { sql_string: stmt });
      if (error) {
        // Try direct query for simple statements
        if (stmt.toUpperCase().startsWith('ALTER TABLE')) {
          // Use PostgREST directly - this won't work but log it
          console.log(`[${i+1}] Skipping ALTER TABLE - needs direct DB access`);
          continue;
        }
        console.log(`[${i+1}] Error: ${error.message} | ${preview}`);
      } else {
        console.log(`[${i+1}] OK: ${preview}`);
      }
    } catch (e) {
      console.log(`[${i+1}] Exception: ${e.message} | ${preview}`);
    }
  }
  
  // Verify column
  const { data, error } = await supabase.from('market_booths').select('id, is_open').limit(1);
  if (error) console.log('\nis_open column: NOT YET AVAILABLE -', error.message);
  else console.log('\nis_open column: AVAILABLE', JSON.stringify(data));
}

run().catch(e => console.error(e));
