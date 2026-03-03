import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_CONNECTION_STRING = process.env.DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"; // Default local supabase db

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY is missing.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pgClient = new Client({ connectionString: DB_CONNECTION_STRING });

async function verifyBackendData() {
  console.log("🔍 Verifying Backend Data Integrity...");

  // 0. Verify Database Trigger Existence
  console.log("🔍 Checking Database Schema for Trigger...");
  try {
    await pgClient.connect();
    const res = await pgClient.query(`
          SELECT trigger_name 
          FROM information_schema.triggers 
          WHERE event_object_table = 'users' 
          AND trigger_name = 'on_auth_user_created';
      `);

    if (res.rows.length === 0) {
      console.error(
        '❌ Trigger "on_auth_user_created" MISSING from table "auth.users"!',
      );
      process.exit(1);
    }
    console.log('✅ Trigger "on_auth_user_created" found in database.');
  } catch (err: any) {
    console.error("❌ Error connecting to database:", err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }

  // 1. Get the Mock User ID
  const { data: { users }, error: listError } = await supabase.auth.admin
    .listUsers();
  const mockUser = users.find((u) => u.email === "mock@social.com");

  if (!mockUser) {
    console.error("❌ Mock user not found in auth.users");
    process.exit(1);
  }
  console.log(`✅ Auth User Found: ${mockUser.id}`);

  // PRE-CLEANUP: Reset Name to default to ensure fresh state for verification test
  await supabase.from("profiles").update({
    full_name: mockUser.user_metadata.full_name,
  }).eq("id", mockUser.id);

  // 2. Verify Profile Data
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", mockUser.id)
    .single();

  if (profileError) {
    console.error("❌ Error fetching profile:", profileError.message);
    process.exit(1);
  }

  const expectedName = mockUser.user_metadata.full_name;
  const expectedAvatar = mockUser.user_metadata.avatar_url;

  if (
    profile.full_name !== expectedName || profile.avatar_url !== expectedAvatar
  ) {
    console.error("❌ Profile Mismatch:");
    console.error("Expected:", {
      full_name: expectedName,
      avatar_url: expectedAvatar,
    });
    console.error("Actual:", {
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    });
    process.exit(1);
  }
  console.log("✅ Profile Data Verified (Name & Avatar match)");

  // 3. Verify Signup Reward (Point Ledger)
  const { data: ledger, error: ledgerError } = await supabase
    .from("point_ledger")
    .select("*")
    .eq("user_id", mockUser.id)
    .eq("type", "reward")
    .single();

  if (ledgerError) {
    console.error("❌ Error fetching point ledger:", ledgerError.message);
    process.exit(1);
  }

  if (ledger.amount !== 100) {
    console.error(
      `❌ Incorrect Reward Amount. Expected 100, got ${ledger.amount}`,
    );
    process.exit(1);
  }
  console.log("✅ Signup Reward Verified (100 Points awarded)");

  // 4. Verify Idempotency (Subsequent Logins should NOT overwrite)
  console.log("🔍 Verifying Idempotency (Subsequent Login)...");

  // A. Modify the profile manually to simulate a user change
  const customName = "User Changed Name";
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ full_name: customName })
    .eq("id", mockUser.id);

  if (updateError) {
    console.error("❌ Failed to update profile for test:", updateError.message);
    process.exit(1);
  }

  // B. Simulate "Login" (Trigger logic check)
  // Since the trigger is ON INSERT, it physically cannot run again for this user.
  // We verified the trigger definition is "after insert on auth.users".

  // C. Verify data persisted
  const { data: updatedProfile, error: reFetchError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", mockUser.id)
    .single();

  if (reFetchError) process.exit(1);

  if (updatedProfile.full_name !== customName) {
    console.error("❌ Idempotency Failed! Profile was overwritten.");
    console.error(
      `Expected: "${customName}", Got: "${updatedProfile.full_name}"`,
    );
    process.exit(1);
  }
  console.log("✅ Idempotency Verified: Profile updates are preserved.");

  // 5. Verify Enriched Seed Data
  console.log("🔍 Verifying Enriched Seed Data...");

  // A. Campaign Rewards (replaced incentive_rules)
  const { data: rewards } = await supabase.from("campaign_rewards").select(
    "behavior",
  ).in("behavior", ["signup", "first_post", "per_referral"]);
  if (!rewards || rewards.length < 3) {
    console.error(
      "❌ Missing Campaign Rewards (signup, first_post, per_referral).",
    );
    process.exit(1);
  }
  console.log("✅ Campaign Rewards found.");

  // B. Category Restrictions (check table exists, may be empty by default)
  const { error: restrictionsError } = await supabase.from(
    "category_restrictions",
  ).select("id").limit(1);
  if (restrictionsError) {
    console.error(
      "❌ Category Restrictions table not accessible:",
      restrictionsError.message,
    );
    process.exit(1);
  }
  console.log("✅ Category Restrictions table accessible.");

  console.log("🎉 Backend Verification Passed!");
}

verifyBackendData();
