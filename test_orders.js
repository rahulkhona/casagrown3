const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT o.id, o.status, p_buyer.email, mp.name, o.seller_rating, o.buyer_rating
    FROM market_orders o
    JOIN market_products mp ON o.product_id = mp.id
    JOIN profiles p_buyer ON o.buyer_id = p_buyer.id
    WHERE mp.name ILIKE '%heirloom%' AND p_buyer.email ILIKE '%beth%';
  `);
  console.log("Orders:", res.rows);
  await client.end();
}
run().catch(console.error);
