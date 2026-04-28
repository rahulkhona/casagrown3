const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT booth_name, distance_miles FROM nearby_booths(
      37.2263, -121.8592, 10, 'all', null, null, null, null, 'CA', false, 20, 0
    );
  `);
  console.log("Returned booths:");
  res.rows.forEach(r => console.log(r.booth_name, "-", r.distance_miles));
  await client.end();
}
run().catch(console.error);
