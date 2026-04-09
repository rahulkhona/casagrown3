import pg from 'pg';
import fs from 'fs/promises';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres'
});

async function run() {
  const sql = await fs.readFile('supabase/migrations/20260401200100_fix_moderation_filter.sql', 'utf8');
  await pool.query(sql);
  console.log('Migration applied successfully via pg!');
  process.exit(0);
}
run();
