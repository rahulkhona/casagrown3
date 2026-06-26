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
  // Lead A: source_platform='facebook' → condition TRUE → reaches action_sms node
  // Lead B: source_platform='direct'   → condition FALSE → reaches false branch
  const leadA = await createLead({ source_platform: "facebook", metadata: { source: "facebook" } });
  const leadB = await createLead({ source_platform: "direct",   metadata: { source: "direct" } });

  const seq = await createSequence({
    startNodeId: "node-cond",
    nodes: [
      {
        id: "node-cond",
        type: "condition",
        data: {
          query: {
            combinator: "and",
            rules: [{ field: "source_platform", operator: "=", value: "facebook" }],
          },
        },
      },
      { id: "node-sms-true",  type: "action_sms", data: { text: "Welcome from Facebook!" } },
      { id: "node-sms-false", type: "action_sms", data: { text: "Welcome!" } },
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

  // Lead A (facebook) → should be on node-sms-true
  const { data: afterA } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollA!.id).single();
  assertEquals(afterA?.current_node_id, "node-sms-true", "Facebook lead should follow true branch");

  // Lead B (direct) → should be on node-sms-false
  const { data: afterB } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollB!.id).single();
  assertEquals(afterB?.current_node_id, "node-sms-false", "Direct lead should follow false branch");

  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: leadA.id },
    { table: "crm_leads", id: leadB.id },
  );
});

// ── Test 8b: AI Condition Node ────────────────────────────────────────────────
dbTest("process-sequence-step: AI condition node evaluates SQL and routes correctly", async () => {
  const leadFB = await createLead({ source_platform: "facebook" });
  const leadDirect = await createLead({ source_platform: "direct" });

  const aiSql = "SELECT id, 'lead' as recipient_type, email, phone, name, NULL as state_code, NULL as city, zipcode as zip_code, NULL as community_h3, created_at as joined_at, accepts_email, accepts_sms FROM crm_leads WHERE source_platform = 'facebook'";

  const seq = await createSequence({
    startNodeId: "node-ai-cond",
    nodes: [
      {
        id: "node-ai-cond",
        type: "condition",
        data: {
          conditionMode: "ai",
          aiSql: aiSql,
          aiPrompt: "Leads from Facebook",
        },
      },
      { id: "node-true", type: "action_sms", data: { text: "FB match!" } },
      { id: "node-false", type: "action_sms", data: { text: "Not FB." } },
    ],
    edges: [
      { id: "e-true", source: "node-ai-cond", target: "node-true", label: "true" },
      { id: "e-false", source: "node-ai-cond", target: "node-false", label: "false" },
    ],
  });

  // Enroll both
  const rFB = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: leadFB.id }]);
  assertEquals((await rFB.json()).enrolled, 1);
  const rDirect = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: leadDirect.id }]);
  assertEquals((await rDirect.json()).enrolled, 1);

  // Get enrollment IDs
  const { data: enrollFB } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("sequence_id", seq.id).eq("recipient_id", leadFB.id).single();
  const { data: enrollDirect } = await supabase.from("crm_sequence_enrollments")
    .select("id").eq("sequence_id", seq.id).eq("recipient_id", leadDirect.id).single();

  // Process
  const res = await processStep();
  const _pd = await res.json();
  assertEquals(res.status, 200);

  // FB lead → true branch
  const { data: afterFB } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollFB!.id).single();
  assertEquals(afterFB?.current_node_id, "node-true", "Facebook lead should match AI condition");

  // Direct lead → false branch
  const { data: afterDirect } = await supabase.from("crm_sequence_enrollments")
    .select("current_node_id").eq("id", enrollDirect!.id).single();
  assertEquals(afterDirect?.current_node_id, "node-false", "Direct lead should not match AI condition");

  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: leadFB.id },
    { table: "crm_leads", id: leadDirect.id },
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

// ── Test: test_run_all sends entire drip sequence at once ────────────────────
dbTest("Sequence Engine: test_run_all processes ALL steps, skips wait delays", async () => {
  const lead = await createLead({ email: `testrunall.${crypto.randomUUID()}@casagrown.local` });

  // Build a multi-step drip: input → email-1 → wait(3 days) → email-2 → sms
  const seq = await createSequence({
    startNodeId: "start",
    nodes: [
      { id: "start", type: "input", data: { type: "input", trigger: "manual" } },
      { id: "email-1", type: "action_email", data: { type: "action_email", subject: "Drip Email 1", html: "<p>Welcome {{name}}!</p>" } },
      { id: "wait-3d", type: "wait", data: { type: "wait", delayDays: 3, delayHours: 0, delayMinutes: 0 } },
      { id: "email-2", type: "action_email", data: { type: "action_email", subject: "Drip Email 2 — Follow Up", html: "<p>Just checking in, {{name}}</p>" } },
      { id: "sms-final", type: "action_sms", data: { type: "action_sms", text: "Hi {{name}}, last chance!" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "email-1" },
      { id: "e2", source: "email-1", target: "wait-3d" },
      { id: "e3", source: "wait-3d", target: "email-2" },
      { id: "e4", source: "email-2", target: "sms-final" },
    ],
  });

  // Enroll lead
  const enrollRes = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  const enrollData = await enrollRes.json();
  assertEquals(enrollRes.status, 200, `Enroll failed: ${JSON.stringify(enrollData)}`);

  // Call process-sequence-step with test_run_all: true
  const processRes = await processStep({ sequence_id: seq.id, test_run_all: true });
  const processData = await processRes.json();
  assertEquals(processRes.status, 200, `Process failed: ${JSON.stringify(processData)}`);

  console.log(`[DEBUG] processData:`, JSON.stringify(processData, null, 2));

  // Should have processed multiple steps (input + email-1 + wait + email-2 + sms = 5 steps)
  assert(processData.processed >= 5, `Expected ≥5 steps processed, got ${processData.processed}. Results: ${JSON.stringify(processData.results)}`);
  assert(processData.iterations >= 2, `Expected multiple iterations, got ${processData.iterations}`);

  // Verify enrollment is completed (reached end of sequence)
  const { data: enrollment } = await supabase.from("crm_sequence_enrollments")
    .select("status")
    .eq("sequence_id", seq.id)
    .eq("recipient_id", lead.id)
    .single();
  assertEquals(enrollment?.status, "completed", `Enrollment should be completed, got: ${enrollment?.status}`);

  // Verify crm_campaign_sends records for both emails and the SMS
  const { data: sends, error: sendsErr } = await supabase.from("crm_campaign_sends")
    .select("node_id, email, phone, sent_at, error")
    .eq("sequence_id", seq.id)
    .eq("recipient_id", lead.id);

  console.log(`[DEBUG] sends query: data=${JSON.stringify(sends)}, error=${JSON.stringify(sendsErr)}`);
  assert(sends && sends.length >= 3, `Expected ≥3 send records (2 emails + 1 sms), got ${sends?.length}`);

  // Email 1 should have been sent
  const email1Send = sends!.find((s: any) => s.node_id === "email-1");
  assertExists(email1Send, "Should have send record for email-1");
  assertEquals(email1Send.email, lead.email, "Email-1 should target the lead's email");

  // Email 2 should have been sent (wait was SKIPPED)
  const email2Send = sends!.find((s: any) => s.node_id === "email-2");
  assertExists(email2Send, "Should have send record for email-2 (wait delay should have been skipped)");
  assertEquals(email2Send.email, lead.email, "Email-2 should target the lead's email");

  // SMS should have been sent (will be stub error since no Twilio config)
  const smsSend = sends!.find((s: any) => s.node_id === "sms-final");
  assertExists(smsSend, "Should have send record for sms-final");

  console.log(`[TEST_RUN_ALL] ✅ All ${processData.processed} steps processed in ${processData.iterations} iterations. ` +
    `Send records: ${sends!.length} (email-1: ${email1Send?.sent_at ? 'sent' : email1Send?.error}, ` +
    `email-2: ${email2Send?.sent_at ? 'sent' : email2Send?.error}, ` +
    `sms: ${smsSend?.sent_at ? 'sent' : smsSend?.error})`);

  // Cleanup
  await supabase.from("crm_campaign_sends").delete().eq("sequence_id", seq.id);
  await supabase.from("crm_sequence_enrollments").delete().eq("sequence_id", seq.id);
  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: lead.id }
  );
});

// ── Test 15: Deprecated sequence rejects new enrollments ─────────────────────
dbTest("enroll-in-sequence: Rejects enrollment in deprecated sequence", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "s1",
    nodes: [
      { id: "s1", type: "action_sms", data: { type: "action_sms", text: "Hello" } },
    ],
    edges: [],
  }, "deprecated");

  const res = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  assertEquals(res.status, 400, "Should reject enrollment in deprecated sequence");
  const body = await res.json();
  assert(body.error.includes("deprecated"), `Error should mention deprecated: ${body.error}`);

  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: lead.id }
  );
});

// ── Test 16: Deprecated sequence still processes existing enrollments ─────────
dbTest("process-sequence-step: Deprecated sequence continues processing existing enrollments", async () => {
  // Create an active sequence and enroll a lead
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "n1",
    nodes: [
      { id: "n1", type: "action_sms", data: { type: "action_sms", text: "Deprecated test SMS" } },
      { id: "n2", type: "terminal", data: { type: "terminal" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
    ],
  }, "active");

  // Enroll while active
  const enrollRes = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  assertEquals(enrollRes.status, 200, "Enrollment should succeed while active");

  // Now deprecate the sequence
  const { error: deprecateErr } = await supabase.from("crm_sequences")
    .update({ status: "deprecated" }).eq("id", seq.id);
  assert(!deprecateErr, `Deprecate failed: ${JSON.stringify(deprecateErr)}`);

  // Process - should still advance the enrollment
  const stepRes = await processStep({ sequence_id: seq.id, is_test: true });
  assertEquals(stepRes.status, 200, "processStep should succeed for deprecated sequence");
  const stepBody = await stepRes.json();
  assert(stepBody.processed > 0, `Should have processed at least 1 enrollment, got ${stepBody.processed}`);

  // Verify enrollment was completed
  const { data: enrollment } = await supabase.from("crm_sequence_enrollments")
    .select("status").eq("sequence_id", seq.id).eq("recipient_id", lead.id).single();
  assertEquals(enrollment?.status, "completed", "Enrollment should be completed after processing");

  // Cleanup
  await supabase.from("crm_campaign_sends").delete().eq("sequence_id", seq.id);
  await supabase.from("crm_sequence_enrollments").delete().eq("sequence_id", seq.id);
  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: lead.id }
  );
});

// ── Test 17: Deprecated → ready_for_deletion when all enrollments complete ──
dbTest("process-sequence-step: Auto-transitions deprecated to ready_for_deletion when all enrollments done", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "n1",
    nodes: [
      { id: "n1", type: "terminal", data: { type: "terminal" } },
    ],
    edges: [],
  }, "active");

  // Enroll and process to completion while active
  await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);

  // Deprecate
  await supabase.from("crm_sequences").update({ status: "deprecated" }).eq("id", seq.id);

  // Process — terminal node completes the enrollment immediately
  // Note: we need to call without is_test so the auto-complete logic runs
  await processStep();

  // Check sequence status — should be ready_for_deletion
  const { data: seqAfter } = await supabase.from("crm_sequences")
    .select("status").eq("id", seq.id).single();
  assertEquals(seqAfter?.status, "ready_for_deletion",
    `Sequence should be ready_for_deletion, got ${seqAfter?.status}`);

  // Cleanup
  await supabase.from("crm_sequence_enrollments").delete().eq("sequence_id", seq.id);
  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: lead.id }
  );
});

// ── Test 18: Reactivate from deprecated ──────────────────────────────────────
dbTest("Sequence lifecycle: Reactivate from deprecated re-enables enrollment", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "s1",
    nodes: [
      { id: "s1", type: "action_sms", data: { type: "action_sms", text: "Hello again" } },
    ],
    edges: [],
  }, "deprecated");

  // Enrollment should fail while deprecated
  const res1 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  assertEquals(res1.status, 400, "Should reject while deprecated");

  // Reactivate
  const { error: reactivateErr } = await supabase.from("crm_sequences")
    .update({ status: "active" }).eq("id", seq.id);
  assert(!reactivateErr, `Reactivate failed: ${JSON.stringify(reactivateErr)}`);

  // Enrollment should now succeed
  const res2 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  assertEquals(res2.status, 200, "Should accept after reactivation");
  const body = await res2.json();
  assert(body.enrolled > 0, `Should have enrolled at least 1, got ${body.enrolled}`);

  // Cleanup
  await supabase.from("crm_sequence_enrollments").delete().eq("sequence_id", seq.id);
  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: lead.id }
  );
});

// ── Test 19: Reactivate from ready_for_deletion ──────────────────────────────
dbTest("Sequence lifecycle: Reactivate from ready_for_deletion re-enables enrollment", async () => {
  const lead = await createLead();
  const seq = await createSequence({
    startNodeId: "s1",
    nodes: [
      { id: "s1", type: "action_sms", data: { type: "action_sms", text: "Back from the dead" } },
    ],
    edges: [],
  }, "ready_for_deletion");

  // Enrollment should fail while ready_for_deletion
  const res1 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  assertEquals(res1.status, 400, "Should reject while ready_for_deletion");

  // Reactivate
  const { error: reactivateErr } = await supabase.from("crm_sequences")
    .update({ status: "active" }).eq("id", seq.id);
  assert(!reactivateErr, `Reactivate failed: ${JSON.stringify(reactivateErr)}`);

  // Enrollment should now succeed
  const res2 = await enroll(seq.id, [{ recipient_type: "lead", recipient_id: lead.id }]);
  assertEquals(res2.status, 200, "Should accept after reactivation from ready_for_deletion");
  const body = await res2.json();
  assert(body.enrolled > 0, `Should have enrolled at least 1, got ${body.enrolled}`);

  // Cleanup
  await supabase.from("crm_sequence_enrollments").delete().eq("sequence_id", seq.id);
  await cleanup(
    { table: "crm_sequences", id: seq.id },
    { table: "crm_leads", id: lead.id }
  );
});

// ── Test 20: Backfill rejects deprecated sequence ────────────────────────────
dbTest("enroll-in-sequence: Backfill rejects deprecated sequence", async () => {
  const seq = await createSequence({
    startNodeId: "s1",
    nodes: [
      { id: "s1", type: "action_sms", data: { type: "action_sms", text: "Backfill test" } },
    ],
    edges: [],
  }, "deprecated");

  // Set a trigger_event so backfill path is taken
  await supabase.from("crm_sequences").update({ trigger_event: "lead.created" }).eq("id", seq.id);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/enroll-in-sequence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ sequence_id: seq.id, backfill: true }),
  });
  assertEquals(res.status, 400, "Backfill should reject deprecated sequence");
  const body = await res.json();
  assert(body.error.includes("deprecated"), `Error should mention deprecated: ${body.error}`);

  await cleanup({ table: "crm_sequences", id: seq.id });
});
