import { assert, assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Skip all tests if not running in a configured environment
const SKIP = !SUPABASE_SERVICE_ROLE_KEY;
if (SKIP) {
  console.warn("[sequence-engine tests] SUPABASE_SERVICE_ROLE_KEY not set — all tests skipped.");
}

const supabase = SKIP
  ? null as any
  : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

// Wrap Deno.test to skip cleanly when SUPABASE_SERVICE_ROLE_KEY is not set
function dbTest(name: string, fn: () => Promise<void>) {
  Deno.test(name, async () => {
    if (SKIP) { console.log(`  [SKIP] ${name}`); return; }
    await fn();
  });
}


async function enroll(sequence_id: string, recipients: any[]) {
  return fetch(`${SUPABASE_URL}/functions/v1/enroll-in-sequence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ sequence_id, recipients }),
  });
}

async function processStep(opts: Record<string, any> = {}) {
  return fetch(`${SUPABASE_URL}/functions/v1/process-sequence-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify(opts),
  });
}

async function createLead(overrides: Record<string, any> = {}) {
  const { data, error } = await supabase.from("crm_leads").insert({
    name: "Test Lead",
    email: `test.${crypto.randomUUID()}@casagrown.local`,
    phone: "+15550001111",
    status: "new",
    accepts_email: true,
    accepts_sms: true,
    ...overrides,
  }).select().single();
  assert(!error, `createLead failed: ${JSON.stringify(error)}`);
  assertExists(data);
  return data;
}

async function createSequence(definition: any, status = "active") {
  const { data, error } = await supabase.from("crm_sequences").insert({
    name: `Test Sequence ${crypto.randomUUID()}`,
    status,
    definition,
  }).select().single();
  assert(!error, `createSequence failed: ${JSON.stringify(error)}`);
  assertExists(data);
  return data;
}

async function cleanup(...ids: Array<{ table: string; id: string }>) {
  for (const { table, id } of ids) {
    await supabase.from(table).delete().eq("id", id);
  }
}

// ── Test 1: Linear SMS Execution ─────────────────────────────────────────────
dbTest("Sequence Engine: Enroll and Linear Execution (SMS Stubbing)", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "node-1",
    nodes: [
      { id: "node-1", type: "action_sms", data: { text: "Hello {{name}}, mock SMS!" } },
      { id: "node-2", type: "wait", data: { delayDays: 1, delayHours: 0 } },
      { id: "node-3", type: "action_email", data: { subject: "Mock Email", html: "Hello" } },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2" },
      { id: "e2-3", source: "node-2", target: "node-3" },
    ],
  });

  const enrollRes = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  const enrollData = await enrollRes.json();
  assertEquals(enrollRes.status, 200, JSON.stringify(enrollData));
  assertEquals(enrollData.enrolled, 1);

  const { data: enrollment } = await supabase.from("crm_sequence_enrollments")
    .select("*").eq("sequence_id", seq.id).eq("recipient_id", lead.id).single();
  assertEquals(enrollment.current_node_id, "node-1");

  const processRes = await processStep();
  const processData1 = await processRes.json();
  console.log("processData1:", processData1);
  assertEquals(processRes.status, 200, JSON.stringify(processData1));

  const { data: enrollmentAfter } = await supabase.from("crm_sequence_enrollments")
    .select("*").eq("id", enrollment.id).single();
  assertEquals(enrollmentAfter.current_node_id, "node-2");

  const { data: sends } = await supabase.from("crm_campaign_sends")
    .select("*").eq("sequence_id", seq.id);
  assertEquals(sends?.length, 1);
  const errorMsg = sends?.[0].error;
  assert(
    errorMsg === null ||
    errorMsg === "mock_sent" ||
    (errorMsg && errorMsg.includes("Marketing SMS not configured")),
    `Unexpected error message: ${errorMsg}`
  );

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: lead.id });
});

// ── Test 2: Schema Validation — Missing sequence_id ──────────────────────────
dbTest("enroll-in-sequence: Rejects missing sequence_id with 400", async () => {
  const res = await enroll("", [{ recipient_type: "lead", recipient_id: crypto.randomUUID() }]);
  const data = await res.json();
  assertEquals(res.status, 400, "Missing sequence_id should return 400");
  assert(data.error);
});

// ── Test 3: Lazy Zod Validation ───────────────────────────────────────────────
dbTest("enroll-in-sequence: Accepts enrollment; process-sequence-step rejects invalid definition", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "node-1",
    nodes: [{ type: "action_email", data: {} }], // Missing 'id' — invalid Zod schema
    edges: [],
  });

  const enrollRes = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  const enrollData = await enrollRes.json();
  assertEquals(enrollRes.status, 200, "Enrollment should succeed with invalid definition");
  assertEquals(enrollData.enrolled, 1);

  const processRes = await processStep({ sequence_id: seq.id });
  const processData = await processRes.json();
  assertEquals(processRes.status, 200);
  assert(
    processData.results?.some((r: any) => r.error && r.error.includes("Required")),
    `Expected Zod 'Required' error. Got: ${JSON.stringify(processData)}`
  );

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: lead.id });
});

// ── Test 4: Missing recipients array ─────────────────────────────────────────
dbTest("enroll-in-sequence: Rejects missing recipients array with 400", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/enroll-in-sequence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ sequence_id: crypto.randomUUID() }),
  });
  const data = await res.json();
  assertEquals(res.status, 400, "Missing recipients should return 400");
  assert(data.error);
});

// ── Test 5: Opt-Out / Consent Filtering ──────────────────────────────────────
dbTest("enroll-in-sequence: Skips lead with accepts_sms=false for SMS sequence", async () => {
  const optedOut = await createLead({ accepts_sms: false, phone: "+15550002222" });
  const optedIn  = await createLead({ accepts_sms: true });

  const seq = await createSequence({
    startNodeId: "node-1",
    nodes: [{ id: "node-1", type: "action_sms", data: { text: "Hey!" } }],
    edges: [],
  });

  // Single opted-out lead — should be skipped entirely
  const res1 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: optedOut.id }]);
  const d1 = await res1.json();
  assertEquals(res1.status, 200, JSON.stringify(d1));
  assertEquals(d1.enrolled, 0, "Opted-out lead should not be enrolled");
  assertEquals(d1.skipped, 1, "Skipped count should be 1");

  // Verify no enrollment row created
  const { data: rows } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("recipient_id", optedOut.id).eq("sequence_id", seq.id);
  assertEquals(rows?.length, 0, "No enrollment row should exist for opted-out lead");

  // Mixed batch: 1 opted-out + 1 opted-in
  const res2 = await enroll(seq.id, [
    { recipient_type: "lead", recipient_id: optedOut.id },
    { recipient_type: "lead", recipient_id: optedIn.id },
  ]);
  const d2 = await res2.json();
  assertEquals(res2.status, 200, JSON.stringify(d2));
  assertEquals(d2.enrolled, 1, "Only opted-in lead should be enrolled");
  assertEquals(d2.skipped, 1, "Opted-out lead should be in skipped count");

  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: optedOut.id },
    { table: "crm_leads", id: optedIn.id },
  );
});

dbTest("enroll-in-sequence: Skips lead with accepts_email=false for email sequence", async () => {
  const noEmail = await createLead({ accepts_email: false });

  const seq = await createSequence({
    startNodeId: "node-1",
    nodes: [{ id: "node-1", type: "action_email", data: { subject: "Hi", html: "<p>Hi</p>" } }],
    edges: [],
  });

  const res = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: noEmail.id }]);
  const d = await res.json();
  assertEquals(res.status, 200, JSON.stringify(d));
  assertEquals(d.enrolled, 0);
  assertEquals(d.skipped, 1);

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: noEmail.id });
});

// ── Test 6: Wait Node Timing ──────────────────────────────────────────────────
dbTest("process-sequence-step: Skips enrollment with future next_evaluation_at", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "node-wait",
    nodes: [
      { id: "node-wait", type: "wait", data: { delayDays: 1 } },
      { id: "node-end", type: "action_sms", data: { text: "Done!" } },
    ],
    edges: [{ id: "e1", source: "node-wait", target: "node-end" }],
  });

  // Manually insert enrollment with next_evaluation_at 1 day in the future
  const futureAt = new Date(Date.now() + 86_400_000).toISOString();
  const { data: enrollment, error: insErr } = await supabase.from("crm_sequence_enrollments").insert({
    sequence_id: seq.id,
    recipient_type: "lead",
    recipient_id: lead.id,
    current_node_id: "node-wait",
    next_evaluation_at: futureAt,
    status: "active",
  }).select().single();
  assert(!insErr, `Insert failed: ${JSON.stringify(insErr)}`);

  // Run processor — should skip this enrollment
  const processRes = await processStep();
  const processData = await processRes.json();
  assertEquals(processRes.status, 200);

  // Enrollment should still be on wait node — not advanced
  const { data: after } = await supabase.from("crm_sequence_enrollments")
    .select("*").eq("id", enrollment.id).single();
  assertEquals(after.current_node_id, "node-wait", "Should remain on wait node (future evaluation)");
  assertEquals(after.status, "active");

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: lead.id });
});

dbTest("process-sequence-step: Advances past wait node when evaluation time has elapsed", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "node-wait",
    nodes: [
      { id: "node-wait", type: "wait", data: { delayDays: 0, delayHours: 0, delayMinutes: 0 } },
      { id: "node-sms", type: "action_sms", data: { text: "Wait done!" } },
    ],
    edges: [{ id: "e1", source: "node-wait", target: "node-sms" }],
  });

  // Insert enrollment with next_evaluation_at in the past
  const pastAt = new Date(Date.now() - 5000).toISOString();
  const { data: enrollment, error: insErr } = await supabase.from("crm_sequence_enrollments").insert({
    sequence_id: seq.id,
    recipient_type: "lead",
    recipient_id: lead.id,
    current_node_id: "node-wait",
    next_evaluation_at: pastAt,
    status: "active",
  }).select().single();
  assert(!insErr, `Insert failed: ${JSON.stringify(insErr)}`);

  // Run processor — should advance from wait → sms node
  const processRes = await processStep();
  const _pd1 = await processRes.json();
  assertEquals(processRes.status, 200);

  const { data: after } = await supabase.from("crm_sequence_enrollments")
    .select("*").eq("id", enrollment.id).single();
  assertEquals(after.current_node_id, "node-sms", "Should have advanced to SMS node after elapsed wait");

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: lead.id });
});

// ── Test 7: Duplicate Enrollment Prevention ───────────────────────────────────
dbTest("enroll-in-sequence: Prevents duplicate enrollment of same recipient", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "node-1",
    nodes: [{ id: "node-1", type: "action_sms", data: { text: "Hello!" } }],
    edges: [],
  });

  // First enrollment — should succeed
  const res1 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  const d1 = await res1.json();
  assertEquals(res1.status, 200, JSON.stringify(d1));
  assertEquals(d1.enrolled, 1);

  // Second enrollment of same lead — should fail with 400 (unique constraint)
  const res2 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  const d2 = await res2.json();
  assertEquals(res2.status, 400, `Second enrollment should return 400. Got: ${JSON.stringify(d2)}`);
  assert(d2.error, "Should contain an error message");

  // Verify only 1 row in DB
  const { data: rows } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("sequence_id", seq.id).eq("recipient_id", lead.id);
  assertEquals(rows?.length, 1, "Exactly 1 enrollment row should exist");

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: lead.id });
});

// ── Test 8: Condition Node / DAG Branching ────────────────────────────────────
dbTest("process-sequence-step: Condition node routes to correct branch (true/false)", async () => {
  // Lead A: status='converted' → condition TRUE → reaches action_sms node
  // Lead B: status='new'       → condition FALSE → reaches completed (no edge from false branch)
  const leadA = await createLead({ status: "converted", metadata: { status: "converted" } });
  const leadB = await createLead({ status: "new",       metadata: { status: "new" } });

  const seq = await createSequence({
    startNodeId: "node-cond",
    nodes: [
      {
        id: "node-cond",
        type: "condition",
        data: {
          query: {
            combinator: "and",
            rules: [{ field: "status", operator: "=", value: "converted" }],
          },
        },
      },
      { id: "node-sms-true",  type: "action_sms", data: { text: "You converted!" } },
      { id: "node-sms-false", type: "action_sms", data: { text: "Still new." } },
    ],
    edges: [
      { id: "e-true",  source: "node-cond", target: "node-sms-true",  label: "true" },
      { id: "e-false", source: "node-cond", target: "node-sms-false", label: "false" },
    ],
  });

  // Enroll both leads (bypass consent filter — both accept_sms=true by default)
  const rA = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: leadA.id }]);
  assertEquals((await rA.json()).enrolled, 1);
  const rB = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: leadB.id }]);
  assertEquals((await rB.json()).enrolled, 1);

  // Get enrollment IDs
  const { data: enrollA } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("sequence_id", seq.id).eq("recipient_id", leadA.id).single();
  const { data: enrollB } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("sequence_id", seq.id).eq("recipient_id", leadB.id).single();

  // Run processor
  const processRes = await processStep();
  const _pd2 = await processRes.json();
  assertEquals(processRes.status, 200);

  // Lead A (converted) → should be on node-sms-true
  const { data: afterA } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollA!.id).single();
  assertEquals(afterA?.current_node_id, "node-sms-true", "Converted lead should follow true branch");

  // Lead B (new) → should be on node-sms-false
  const { data: afterB } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollB!.id).single();
  assertEquals(afterB?.current_node_id, "node-sms-false", "New lead should follow false branch");

  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: leadA.id },
    { table: "crm_leads", id: leadB.id },
  );
});

// ── Test 9: Email Action Node ─────────────────────────────────────────────────
dbTest("process-sequence-step: action_email node creates campaign_sends row and advances", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "node-email",
    nodes: [
      { id: "node-email", type: "action_email", data: { subject: "Welcome {{name}}!", html: "<p>Hi!</p>" } },
      { id: "node-done",  type: "action_sms",   data: { text: "Done!" } },
    ],
    edges: [{ id: "e1", source: "node-email", target: "node-done" }],
  });

  const enrollRes = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  const enrollData = await enrollRes.json();
  assertEquals(enrollRes.status, 200, JSON.stringify(enrollData));
  assertEquals(enrollData.enrolled, 1);

  const { data: enrollment } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("sequence_id", seq.id).eq("recipient_id", lead.id).single();

  // Run processor — should fire the email node
  const processRes = await processStep();
  const _pd3 = await processRes.json();
  assertEquals(processRes.status, 200);

  // Enrollment should have advanced to node-done
  const { data: after } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollment!.id).single();
  assertEquals(after?.current_node_id, "node-done", "Should have advanced past email node");

  // crm_campaign_sends row should exist for this sequence + lead
  const { data: sends } = await supabase.from("crm_campaign_sends")
    .select("*").eq("sequence_id", seq.id).eq("recipient_id", lead.id);
  assert(sends && sends.length >= 1, `Should have a campaign_sends row for the email action. Got: ${JSON.stringify(sends)}`);
  assertEquals(sends![0].node_id, "node-email");

  await cleanup({ table: "crm_sequences", id: seq.id }, { table: "crm_leads", id: lead.id });
});

// ── Test 10: Member Recipient Type ────────────────────────────────────────────
dbTest("process-sequence-step: Correctly handles recipient_type='member' via profiles", async () => {
  // Fetch a real profile from the DB (seeded test user)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .not("email", "is", null)
    .limit(1)
    .single();
  assert(profile, "Need at least one profile in DB for this test (run db seed first)");

  const seq = await createSequence({
    startNodeId: "node-sms",
    nodes: [{ id: "node-sms", type: "action_sms", data: { text: "Hi member {{name}}!" } }],
    edges: [],
  });

  // Directly insert enrollment as 'member' type (bypassing consent filter for this test)
  const { data: enrollment, error: insErr } = await supabase.from("crm_sequence_enrollments").insert({
    sequence_id: seq.id,
    recipient_type: "member",
    recipient_id: profile.id,
    current_node_id: "node-sms",
    next_evaluation_at: new Date(Date.now() - 1000).toISOString(),
    status: "active",
  }).select().single();
  assert(!insErr, `Insert failed: ${JSON.stringify(insErr)}`);

  // Run processor — should NOT throw "lead not found" error
  const processRes = await processStep();
  const processData = await processRes.json();
  assertEquals(processRes.status, 200);

  // Enrollment should have completed (no next node after sms)
  const { data: after } = await supabase.from("crm_sequence_enrollments")
    .select("status").eq("id", enrollment.id).single();

  // It either completed or advanced — but should NOT have an error
  const result = processData.results?.find((r: any) => r.id === enrollment.id);
  assert(result, "Should have a result entry for this enrollment");
  assert(!result.error || !result.error.includes("not found"), 
    `Should not error with 'not found'. Got: ${result.error}`);

  await cleanup({ table: "crm_sequences", id: seq.id });
  // Don't delete the profile — it's a seeded test user
});
