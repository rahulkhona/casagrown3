const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres' });
async function run() {
  try {
    const res = await pool.query("SELECT * FROM crm_audience_has_bought_before();");
    console.log(`Success: ${res.rowCount} rows returned.`);
  } catch(e) {
    console.log("Error:", e.message);
  }
  pool.end();
}
run();
