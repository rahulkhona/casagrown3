import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
const client = new Client("postgresql://postgres:postgres@localhost:54322/postgres");
await client.connect();
const result = await client.queryObject(`SELECT * FROM nearby_booths(37.33, -121.88, 25, 'all', 'sugarcane');`);
console.log(`returned ${result.rows.length} rows`);
await client.end();
