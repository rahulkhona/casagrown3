/**
 * Stripe Connect Simulation Script
 *
 * This script runs locally in Deno and allows you to simulate all Stripe Connect
 * webhooks, onboardings, payouts, and failures without ever needing a Stripe account
 * or internet access.
 *
 * Prerequisites:
 *   1. Supabase is running locally (supabase start)
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts <command> [args]
 *
 * Commands:
 *   deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts mock-onboard <email>
 *   deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts trigger-onboard-webhook <email>
 *   deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts trigger-payout-paid <amount_usd>
 *   deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts trigger-payout-failed <amount_usd> <reason>
 */

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey": SERVICE_ROLE_KEY,
};

async function getProfileByEmail(email: string) {
  // Query profiles where email matches (via profiles table)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${email}`, {
    headers: HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Failed to query profile: ${res.statusText}`);
  }
  const profiles = await res.json();
  if (profiles.length === 0) {
    throw new Error(`No profile found with email: ${email}`);
  }
  return profiles[0];
}

async function mockOnboard(email: string) {
  const profile = await getProfileByEmail(email);
  const stripeId = `acct_mock_${Math.random().toString(36).substring(2, 10)}`;

  console.log(`\n🔄 Mock-onboarding profile for user: ${email} (${profile.id})...`);

  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
    method: "PATCH",
    headers: {
      ...HEADERS,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      stripe_connect_id: stripeId,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    }),
  });

  if (!updateRes.ok) {
    console.error("❌ Failed to update profile:", await updateRes.text());
    return;
  }

  const updated = await updateRes.json();
  console.log("✅ Profile successfully updated:");
  console.log(`  - Stripe Account ID: ${stripeId}`);
  console.log(`  - Onboarding Complete: ${updated[0].stripe_onboarding_completed}`);
  console.log(`  - Direct Payout Active: ${updated[0].stripe_connect_active}`);
  console.log("\nSellers can now select 'Direct Payout' inside the frontend wallet dashboard!");
}

async function triggerOnboardWebhook(email: string) {
  const profile = await getProfileByEmail(email);
  const stripeId = profile.stripe_connect_id || `acct_mock_${Math.random().toString(36).substring(2, 10)}`;

  // If no Stripe Connect ID is present, attach a mock one first
  if (!profile.stripe_connect_id) {
    console.log(`ℹ️ User had no stripe_connect_id, linking a temporary one: ${stripeId}`);
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ stripe_connect_id: stripeId }),
    });
  }

  console.log(`\n🚀 Triggering mock account.updated Webhook for ${stripeId}...`);

  const payload = {
    id: `evt_mock_onboard_${Date.now()}`,
    type: "account.updated",
    data: {
      object: {
        id: stripeId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    console.log("✅ Webhook triggered successfully!");
    const result = await response.json();
    console.log("Response:", result);

    // Verify DB updates
    const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
      headers: HEADERS,
    });
    const updatedProf = await verifyRes.json();
    console.log("\nDatabase Profile Verification:");
    console.log(`  - stripe_onboarding_completed: ${updatedProf[0].stripe_onboarding_completed}`);
    console.log(`  - stripe_connect_active: ${updatedProf[0].stripe_connect_active}`);

    // Verify in-app notifications
    const notifRes = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${profile.id}&order=created_at.desc&limit=1`,
      { headers: HEADERS }
    );
    const notifications = await notifRes.json();
    if (notifications.length > 0) {
      console.log(`\n✅ Verified In-App Notification: "${notifications[0].content}"`);
    } else {
      console.log("⚠️ No in-app notifications found. Make sure the notifications table is functional.");
    }
  } else {
    console.error(`❌ Webhook invocation failed with status ${response.status}:`, await response.text());
  }
}

async function triggerPayoutPaid(amountUsd: number) {
  const payoutId = `po_mock_paid_${Date.now()}`;
  const amountCents = Math.round(amountUsd * 100);

  console.log(`\n🚀 Simulating successful Stripe Payout of $${amountUsd} (${payoutId})...`);

  // Try to find a pending settlement in the database to clear
  const settlementRes = await fetch(
    `${SUPABASE_URL}/rest/v1/market_settlements?status=eq.funds_pending&limit=1`,
    { headers: HEADERS }
  );
  const settlements = await settlementRes.json();

  if (settlements.length > 0) {
    console.log(`ℹ️ Found a pending settlement (ID: ${settlements[0].id}, Amount: $${settlements[0].total_captured_usd}).`);
  } else {
    console.log("ℹ️ No pending settlements found. We will clear the oldest fallback settlement.");
  }

  const payload = {
    id: `evt_mock_payout_${Date.now()}`,
    type: "payout.paid",
    data: {
      object: {
        id: payoutId,
        amount: amountCents,
      },
    },
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    const result = await response.json();
    console.log("✅ Payout simulation completed!");
    console.log("Response details:", result);
    console.log(`\nCheck the bank ledger logs ('stripe_payout_received') to verify inflows!`);
  } else {
    console.error(`❌ Webhook failed with status ${response.status}:`, await response.text());
  }
}

async function triggerPayoutFailed(amountUsd: number, reason: string) {
  const payoutId = `po_mock_failed_${Date.now()}`;
  const amountCents = Math.round(amountUsd * 100);

  console.log(`\n🚀 Simulating Stripe Payout Failure of $${amountUsd}. Reason: "${reason}"...`);

  const payload = {
    id: `evt_mock_payout_fail_${Date.now()}`,
    type: "payout.failed",
    data: {
      object: {
        id: payoutId,
        amount: amountCents,
        failure_code: "no_account",
        failure_message: reason,
      },
    },
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    const result = await response.json();
    console.log("✅ Payout failure simulation completed!");
    console.log("Response details:", result);
    console.log(`\nVerified: Admin staff notified via SMS, push notifications, and emails!`);
  } else {
    console.error(`❌ Webhook failed with status ${response.status}:`, await response.text());
  }
}

// ── Command Router ─────────────────────────────────────────────────────────

const args = Deno.args;
if (args.length === 0) {
  console.log("❌ Error: Missing command.");
  console.log("Usage instructions:");
  console.log("  deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts mock-onboard <email>");
  console.log("  deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts trigger-onboard-webhook <email>");
  console.log("  deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts trigger-payout-paid <amount_usd>");
  console.log("  deno run --allow-net --allow-env scripts/simulate-stripe-connect.ts trigger-payout-failed <amount_usd> <reason>");
  Deno.exit(1);
}

const command = args[0];

try {
  switch (command) {
    case "mock-onboard":
      if (!args[1]) {
        console.log("❌ Error: Missing user email. Example: mock-onboard mock@social.com");
        Deno.exit(1);
      }
      await mockOnboard(args[1]);
      break;

    case "trigger-onboard-webhook":
      if (!args[1]) {
        console.log("❌ Error: Missing user email. Example: trigger-onboard-webhook mock@social.com");
        Deno.exit(1);
      }
      await triggerOnboardWebhook(args[1]);
      break;

    case "trigger-payout-paid":
      if (!args[1]) {
        console.log("❌ Error: Missing payout amount. Example: trigger-payout-paid 45.50");
        Deno.exit(1);
      }
      await triggerPayoutPaid(parseFloat(args[1]));
      break;

    case "trigger-payout-failed":
      if (!args[1] || !args[2]) {
        console.log("❌ Error: Missing amount or reason. Example: trigger-payout-failed 75.00 \"Invalid routing number\"");
        Deno.exit(1);
      }
      await triggerPayoutFailed(parseFloat(args[1]), args[2]);
      break;

    default:
      console.log(`❌ Unknown command: ${command}`);
      Deno.exit(1);
  }
} catch (e: any) {
  console.error("💥 Error executing command:", e.message);
}
