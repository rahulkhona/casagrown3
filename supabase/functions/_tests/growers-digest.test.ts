import { assertEquals, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

Deno.test("E2E: Manual Campaign Dispatch (Growers Digest)", async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) { return; }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Manually insert the "Growers Digest" campaign (Simulating the Admin UI)
  const { data: campaign } = await supabase
    .from("crm_campaigns")
    .insert({
      name: "Growers Digest Newsletter",
      subject: "Your Weekly Digest",
      postmark_template_alias: "growers-digest",
      channel: "email",
      status: "scheduled"
    })
    .select()
    .single();

  assertExists(campaign.id);
  console.log(`[TEST] 1. Created manual campaign: ${campaign.id}`);

  // 2. Invoke the dispatcher exactly as the cron/admin UI would
  console.log("[TEST] 2. Submitting Campaign ID to the Edge Function...");
  const res = await supabase.functions.invoke("send-crm-campaign", {
    body: { campaign_id: campaign.id }
  });

  // Because the Local DB doesn't have a fake global audience injected by default,
  // it might just say "No campaigns to send" or process 0.
  // We'll verify it returns a 200 OK without crashing.
  assertEquals(res.error, null);
  console.log("[TEST] 3. Dispatch Result:", res.data);
});
