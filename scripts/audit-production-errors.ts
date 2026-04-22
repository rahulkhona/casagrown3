import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from the nearest .env file
dotenv.config({ path: resolve(process.cwd(), ".env") });

// Hardcoded Staging Environment
const supabaseUrl = "https://fzdmszvfeewpwswlnfyk.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("❌ Missing Supabase credentials!");
  console.error("Please ensure the SUPABASE_SERVICE_ROLE_KEY environment variable is set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProductionHealth() {
  console.log("🔍 Scanning Production Database for Errors & Alerts...\n");
  let hasErrors = false;

  // 1. Check for Failed Cashouts / Redemptions
  const { data: failedRedemptions, error: redemptionErr } = await supabase
    .from("redemptions")
    .select("id, user_id, point_cost, failed_reason, created_at, metadata")
    .eq("status", "failed")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

  if (redemptionErr) {
    console.error("❌ Failed to query redemptions:", redemptionErr);
  } else if (failedRedemptions && failedRedemptions.length > 0) {
    hasErrors = true;
    console.log(`🚨 FOUND ${failedRedemptions.length} FAILED CASHOUTS (Last 24h):`);
    failedRedemptions.forEach((r) => {
      console.log(`   - Redemption ID: ${r.id}`);
      console.log(`     User: ${r.user_id}`);
      console.log(`     Amount: $${(r.point_cost / 100).toFixed(2)}`);
      console.log(`     Reason: ${r.failed_reason || "Unknown Webhook Error"}`);
      console.log(`     Data: ${JSON.stringify(r.metadata)}\n`);
    });
  } else {
    console.log("✅ No failed cashouts detected in the last 24 hours.");
  }

  // 2. Check for Unresolved Trust & Safety Escalations
  const { data: escalations, error: escalationErr } = await supabase
    .from("escalations")
    .select("id, status, created_at, reason")
    .neq("status", "resolved");

  if (escalationErr) {
    console.error("❌ Failed to query escalations:", escalationErr);
  } else if (escalations && escalations.length > 0) {
    hasErrors = true;
    console.log(`\n🚨 FOUND ${escalations.length} UNRESOLVED ESCALATIONS:`);
    escalations.forEach((e) => {
      console.log(`   - Ticket: ${e.id} | Status: [${e.status}]`);
      console.log(`     Reason: ${e.reason}`);
      console.log(`     Created: ${new Date(e.created_at).toLocaleString()}\n`);
    });
  } else {
    console.log("✅ No pending trust & safety escalations.");
  }

  // 3. Final Summary
  console.log("---------------------------------------------------");
  if (hasErrors) {
    console.log("⚠️ ACTION REQUIRED: You have pending errors to resolve.");
  } else {
    console.log("🎉 ALL SYSTEMS GO: No immediate database actions required.");
  }
}

checkProductionHealth();
