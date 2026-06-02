import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
const client = new Client("postgresql://postgres:postgres@localhost:54322/postgres");
await client.connect();

const sql1 = await Deno.readTextFile("supabase/migrations/20260604000000_add_subscription_tiers.sql");
await client.queryArray(sql1);
console.log("Applied migration 1 successfully.");

const sql2 = await Deno.readTextFile("supabase/migrations/20260605000000_update_subscription_tiers_cc_and_history.sql");
await client.queryArray(sql2);
console.log("Applied migration 2 successfully.");

const sql3 = await Deno.readTextFile("supabase/migrations/20260606000000_allow_unlimited_tiers.sql");
await client.queryArray(sql3);
console.log("Applied migration 3 successfully.");

const sql4 = await Deno.readTextFile("supabase/migrations/20260607000000_add_subscription_tiers_offered_flag.sql");
await client.queryArray(sql4);
console.log("Applied migration 4 successfully.");

const sql5 = await Deno.readTextFile("supabase/migrations/20260608000000_unlimited_booths_limit.sql");
await client.queryArray(sql5);
console.log("Applied migration 5 successfully.");

const sql6 = await Deno.readTextFile("supabase/migrations/20260609000000_crm_promo_dynamic_tiers_overrides.sql");
await client.queryArray(sql6);
console.log("Applied migration 6 successfully.");

const sql7 = await Deno.readTextFile("supabase/migrations/20260610000000_best_benefit_promotion_resolution.sql");
await client.queryArray(sql7);
console.log("Applied migration 7 successfully.");

const sql8 = await Deno.readTextFile("supabase/migrations/20260611000000_fix_promo_rpc_subquery.sql");
await client.queryArray(sql8);
console.log("Applied migration 8 successfully.");

const sql9 = await Deno.readTextFile("supabase/migrations/20260612000000_add_booth_marked_for_archival.sql");
await client.queryArray(sql9);
console.log("Applied migration 9 successfully.");

await client.end();
