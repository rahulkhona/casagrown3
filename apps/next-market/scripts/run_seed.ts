import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function run() {
  const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  await client.connect();
  try {
    const sqlPath = path.join(__dirname, '../../../supabase/seed_marketing.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Marketing seed executed successfully!');
  } catch (e) {
    console.error('Error executing seed:', e);
  } finally {
    await client.end();
  }
}

run();
