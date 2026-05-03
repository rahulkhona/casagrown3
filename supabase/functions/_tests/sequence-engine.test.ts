import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

// Since we are strictly executing locally without hitting Twilio, we'll test the sequence engine
// directly via HTTP calls against the local Supabase Edge Functions.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.test("Sequence Engine: Enroll and Linear Execution (SMS Stubbing)", async () => {
  console.log("Key length:", SUPABASE_SERVICE_ROLE_KEY.length);
  // 1. Create a mock audience (Lead)
  const { data: lead } = await supabase.from("crm_leads").insert({
    name: "Test Sequence Lead",
    email: "test.seq@casagrown.local",
    phone: "+15550001111",
    status: "new",
    accepts_email: true,
    accepts_sms: true,
  }).select().single();

  assert(lead, "Failed to create test lead");

  // 2. Define a sequence
  const definition = {
    startNodeId: "node-1",
    nodes: [
      { id: "node-1", type: "action_sms", data: { text: "Hello {{name}}, mock SMS!" } },
      { id: "node-2", type: "wait", data: { delayDays: 1, delayHours: 0 } },
      { id: "node-3", type: "action_email", data: { subject: "Mock Email", html: "Hello" } }
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2" },
      { id: "e2-3", source: "node-2", target: "node-3" }
    ]
  };

  const { data: sequence } = await supabase.from("crm_sequences").insert({
    name: "Integration Test Sequence",
    status: "active",
    definition
  }).select().single();

  assert(sequence, "Failed to create sequence");

  // 3. Call enroll-in-sequence via Edge Function
  const enrollRes = await fetch(`${SUPABASE_URL}/functions/v1/enroll-in-sequence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      sequence_id: sequence.id,
      recipients: [{ recipient_type: "lead", recipient_id: lead.id }]
    })
  });

  const enrollData = await enrollRes.json();
  assertEquals(enrollRes.status, 200, JSON.stringify(enrollData));
  assertEquals(enrollData.enrolled, 1);

  // 4. Verify enrollment state
  let { data: enrollment } = await supabase.from("crm_sequence_enrollments")
    .select("*").eq("sequence_id", sequence.id).eq("recipient_id", lead.id).single();

  assertEquals(enrollment.current_node_id, "node-1");

  // 5. Run process-sequence-step
  const processRes1 = await fetch(`${SUPABASE_URL}/functions/v1/process-sequence-step`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({})
  });
  
  const processData1 = await processRes1.json();
  console.log("processData1:", processData1);
  assertEquals(processRes1.status, 200, JSON.stringify(processData1));

  // 6. Verify enrollment moved to wait node and SMS tracking row was created
  const { data: enrollmentAfter1 } = await supabase.from("crm_sequence_enrollments")
    .select("*").eq("id", enrollment.id).single();
  
  assertEquals(enrollmentAfter1.current_node_id, "node-2");

  const { data: sends } = await supabase.from("crm_campaign_sends")
    .select("*").eq("sequence_id", sequence.id);
  
  assertEquals(sends?.length, 1);
  assertEquals(sends?.[0].error, "mock_sent");

  // Cleanup
  await supabase.from("crm_sequences").delete().eq("id", sequence.id);
  await supabase.from("crm_leads").delete().eq("id", lead.id);
});
