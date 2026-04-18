import { assertEquals, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

Deno.test("E2E: Auto-Create System Alias Campaign & Track Open", async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
     console.log("Skipping test: Missing Supabase credentials in env.");
     return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("1. Triggering send-crm-campaign with system_alias payload...");
  const systemAlias = `test-alias-${Date.now()}`;
  
  // Directly invoking the deployed function on staging
  const res = await supabase.functions.invoke("send-crm-campaign", {
    body: {
      system_alias: systemAlias,
      subject: "Test Automated Delivery",
      template_alias: "welcome-email",
      audience: [{
        id: crypto.randomUUID(),
        recipient_type: "user",
        email: "test.uuid.tracking@casagrown.com",
        name: "UUID Tester",
        accepts_email: true
      }]
    }
  });
  
  const json = res.data;
  console.log("Dispatch Response:", json);
  
  assertEquals(res.error, null);
  
  // Verify campaign auto-created
  console.log("2. Verifying 'crm_campaigns' creation via pgSQL");
  const { data: campaign } = await supabase.from("crm_campaigns").select("id").eq("system_alias", systemAlias).single();
  assertExists(campaign?.id);
  
  // Verify UUID Tracking metadata row was generated
  console.log("3. Verifying 'crm_campaign_sends' stamped deterministic UUID tracking ID");
  const { data: sendRow } = await supabase.from("crm_campaign_sends").select("id").eq("campaign_id", campaign.id).single();
  assertExists(sendRow?.id);
  
  const sendId = sendRow.id;
  console.log(`Successfully intercepted UUID Send ID: ${sendId}`);
  
  // Verify Webhook Processing
  console.log("4. Simulating Webhook Trigger payload with SendID from Postmark");
  await supabase.functions.invoke("postmark-webhook", {
     body: {
        RecordType: "Open",
        Recipient: "test.uuid.tracking@casagrown.com",
        Metadata: {
           send_id: sendId
        }
     }
  });
  
  // Final state check: The exact timestamp should now exist mathematically matched to the primary key
  const { data: updatedSend } = await supabase.from("crm_campaign_sends").select("opened_at").eq("id", sendId).single();
  assertExists(updatedSend?.opened_at);
  console.log(`✅ Success! Lifecycle closed via UUID mapping: Opened At = ${updatedSend.opened_at}`);
});
