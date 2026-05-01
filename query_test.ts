import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";
const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const rs = await sql`SELECT pg_typeof(status) FROM redemptions LIMIT 1`;
console.log(rs);
await sql.end();
