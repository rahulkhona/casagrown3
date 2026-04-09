import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
const client = new Client("postgresql://postgres:postgres@localhost:54322/postgres");
await client.connect();
const result = await client.queryObject(`SELECT name, description, category FROM demo_product_catalog WHERE lower(concat_ws(' ', name, description, category)) LIKE '%sugarcane%'`);
console.log(result.rows);
await client.end();
