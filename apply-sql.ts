import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
const client = new Client("postgresql://postgres:postgres@localhost:54322/postgres");
await client.connect();
const sql = await Deno.readTextFile("supabase/migrations/20260601000000_checkout_messenger_tracking.sql");
await client.queryArray(sql);
console.log("Applied SQL successfully.");
await client.end();
