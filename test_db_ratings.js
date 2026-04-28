const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT o.id, o.status, p_buyer.email as buyer, p_seller.email as seller, mp.name, o.buyer_rating, o.seller_rating
    FROM market_orders o
    JOIN market_products mp ON o.product_id = mp.id
    JOIN profiles p_buyer ON o.buyer_id = p_buyer.id
    JOIN profiles p_seller ON o.seller_id = p_seller.id
    WHERE o.status = 'completed';
  `);
  console.log("Completed orders:");
  console.table(res.rows);
  await client.end();
}
run().catch(console.error);
