/**
 * Integration test for process-selected-payouts edge function
 *
 * Tests that an admin can manually trigger a queued Tremendous redemption.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/_tests/process-selected-payouts.test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction, serviceHeaders, getTestUserToken } from "../_shared/test-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.36.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() || "http://127.0.0.1:54321";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BQy4UlCDU";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

Deno.test("process-selected-payouts executes Tremendous payout via sandbox", async () => {
    // 1. Create a real test user via getTestUserToken (this sets up auth.users and public.profiles)
    const testToken = await getTestUserToken();
    const testUserId = JSON.parse(atob(testToken.split(".")[1] || "")).sub as string;
    
    // 2. Mock a queued Tremendous redemption
    const mockRedemptionId = crypto.randomUUID();
    const { error: insertErr } = await supabaseAdmin.from("redemptions").insert({
        id: mockRedemptionId,
        user_id: testUserId,
        point_cost: 2500, // $25.00
        status: "queued",
        provider: "tremendous",
        metadata: {
            brand_name: "Amazon.com",
            product_id: "",
            face_value_cents: 2500,
        }
    });

    assertEquals(insertErr, null, `Insert redemption failed: ${JSON.stringify(insertErr)}`);

    // 3. Call the edge function (Service role bypasses admin check)
    const { status, data } = await invokeFunction(
        "process-selected-payouts",
        { redemption_ids: [mockRedemptionId] },
        serviceHeaders(),
    );

    // It should succeed
    assertEquals(status, 200, `Expected 200, got ${status}`);
    assertEquals(data.success, true);
    if (data.processed !== 1) {
        console.error("Response data:", data);
    }
    assertEquals(data.processed, 1);
    assertEquals(data.failed, 0);

    // 4. Verify database state is updated correctly
    const { data: updatedRedemption } = await supabaseAdmin.from("redemptions")
        .select("status, provider, metadata, provider_order_id")
        .eq("id", mockRedemptionId)
        .single();

    // Because Tremendous LINK orders are processed asynchronously via webhook,
    // the status should still be 'pending' but it should have a provider_order_id attached
    assertEquals(updatedRedemption?.status, "pending");
    assertEquals(updatedRedemption?.provider, "tremendous");
    assertExists(updatedRedemption?.provider_order_id, "Should have an external order ID");
    assertEquals(updatedRedemption?.metadata?.pending_async_webhook, true);

    // Cleanup
    await supabaseAdmin.from("redemptions").delete().eq("id", mockRedemptionId);
    await supabaseAdmin.from("profiles").delete().eq("id", testUserId);
});
