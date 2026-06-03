import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
const client = new Client("postgresql://postgres:postgres@localhost:54322/postgres");
await client.connect();

try {
  console.log("Clearing seller_subscriptions...");
  await client.queryArray("DELETE FROM seller_subscriptions;");
  console.log("Clearing pro_testers...");
  await client.queryArray("DELETE FROM pro_testers;");
  console.log("Subscriptions and Pro/Elite overrides successfully disabled in database!");
} catch (e) {
  console.error("Database error:", e);
} finally {
  await client.end();
}
