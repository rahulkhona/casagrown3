const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT b.name, p.email, p.state_code 
    FROM market_booths b 
    JOIN profiles p ON p.id = b.owner_id;
  `);
  console.log("Booths and their owners' state_code:");
  console.table(res.rows);
  await client.end();
}
run().catch(console.error);
