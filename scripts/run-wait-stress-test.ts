import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const UNIQUE = `STRESS_WAIT_TEST_${Date.now()}`;
let leadIds: string[] = [];
let sequenceId = "";

async function triggerSequenceProcess() {
  const res = await fetch("http://127.0.0.1:54321/functions/v1/process-sequence-step", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      sequence_id: sequenceId,
      test_run_all: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Process sequence step failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function runCycleUntilEmpty(label: string) {
  console.log(`\nExecuting ${label}...`);
  let totalProcessed = 0;
  let run = 1;
  while (true) {
    const res = await triggerSequenceProcess();
    console.log(`  Run ${run}: processed ${res.processed} enrollments`);
    totalProcessed += res.processed;
    if (res.processed < 100) {
      break;
    }
    run++;
  }
  console.log(`  Total processed in ${label}: ${totalProcessed}`);
  return totalProcessed;
}

async function enrollInSequence(body: Record<string, unknown>) {
  const res = await fetch("http://127.0.0.1:54321/functions/v1/enroll-in-sequence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Enroll in sequence failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function printEnrollmentSummary(label: string) {
  const rows = await sql`
    SELECT current_node_id, status, count(*)::int as cnt
    FROM crm_sequence_enrollments
    WHERE sequence_id = ${sequenceId}
    GROUP BY current_node_id, status;
  `;
  console.log(`\n--- Enrollment Summary: ${label} ---`);
  for (const r of rows) {
    console.log(`  Node: ${r.current_node_id} | Status: ${r.status} | Count: ${r.cnt}`);
  }
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

try {
  // 1. Calculate dynamic slot window in America/Los_Angeles timezone
  const nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const currentHour = nowLocal.getHours();
  const currentMinute = nowLocal.getMinutes();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const currentDay = dayNames[nowLocal.getDay()];

  // Slot start: 3 minutes from now
  let targetMinute = currentMinute + 3;
  let targetHour = currentHour;
  let targetDay = currentDay;
  if (targetMinute >= 60) {
    targetMinute -= 60;
    targetHour = (targetHour + 1) % 24;
    if (targetHour === 0) {
      targetDay = dayNames[(nowLocal.getDay() + 1) % 7];
    }
  }

  // Slot end: 5 minutes from now (giving slightly larger window for 120 leads processing)
  let endMinute = targetMinute + 2;
  let endHour = targetHour;
  let endDay = targetDay;
  if (endMinute >= 60) {
    endMinute -= 60;
    endHour = (endHour + 1) % 24;
    if (endHour === 0) {
      endDay = dayNames[(dayNames.indexOf(targetDay) + 1) % 7];
    }
  }

  const slotStartStr = `${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}`;
  const slotEndStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

  console.log(`Current Time (LA): ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')} (${currentDay})`);
  console.log(`Calculated Slot Window: ${slotStartStr} to ${slotEndStr} (${targetDay})`);

  // 2. Create 120 test leads in bulk
  console.log("\nCreating 120 test leads...");
  const leadsToInsert = [];
  for (let i = 1; i <= 120; i++) {
    leadsToInsert.push({
      name: `Stress User ${i} (${UNIQUE})`,
      email: `stress-user${i}-${UNIQUE}@test.com`,
      accepts_email: true,
      accepts_sms: true
    });
  }

  const insertedLeads = await sql`
    INSERT INTO crm_leads ${sql(leadsToInsert, 'name', 'email', 'accepts_email', 'accepts_sms')}
    RETURNING id;
  `;
  leadIds = insertedLeads.map(l => l.id);
  console.log(`Successfully created ${leadIds.length} test leads.`);

  // 3. Create sequence definition with 1-minute wait and slot window
  const sequenceDef = {
    nodes: [
      { id: "start", type: "input", data: { type: "input" }, position: { x: 250, y: 0 } },
      { id: "msg_1", type: "default", data: { type: "action_email", subject: `${UNIQUE} Email 1`, html: `Hello {{model.name}}, this is the first email.` }, position: { x: 250, y: 100 } },
      { id: "wait_1", type: "default", data: { type: "wait", delayDays: 0, delayHours: 0, delayMinutes: 1 }, position: { x: 250, y: 200 } },
      { id: "msg_2", type: "default", data: { type: "action_email", subject: `${UNIQUE} Email 2`, html: `Hello {{model.name}}, this is the second email after 1 minute wait.` }, position: { x: 250, y: 300 } },
      { id: "wait_slot", type: "default", data: { type: "wait_for_slot", slots: [{ day: targetDay, start: slotStartStr, end: slotEndStr }] }, position: { x: 250, y: 400 } },
      { id: "msg_3", type: "default", data: { type: "action_email", subject: `${UNIQUE} Email 3`, html: `Hello {{model.name}}, this is the third email sent in dynamic optimal slot.` }, position: { x: 250, y: 500 } },
    ],
    edges: [
      { id: "e1", source: "start", target: "msg_1" },
      { id: "e2", source: "msg_1", target: "wait_1" },
      { id: "e3", source: "wait_1", target: "msg_2" },
      { id: "e4", source: "msg_2", target: "wait_slot" },
      { id: "e5", source: "wait_slot", target: "msg_3" },
    ],
    startNodeId: "start",
  };

  const seqName = `${UNIQUE} Live Waits Stress E2E Test`;
  const [seq] = await sql`
    INSERT INTO crm_sequences (name, definition, status)
    VALUES (${seqName}, ${sequenceDef}, 'active')
    RETURNING id;
  `;
  sequenceId = seq.id;
  console.log(`Sequence Created: ${sequenceId}`);

  // 4. Enroll Leads
  console.log("\nEnrolling leads in sequence...");
  await enrollInSequence({
    sequence_id: sequenceId,
    recipients: leadIds.map(id => ({ recipient_type: "lead", recipient_id: id })),
  });
  await printEnrollmentSummary("State: Enrolled");

  // 5. Cycle 1: start -> msg_1
  await runCycleUntilEmpty("Cycle 1 (start -> msg_1)");
  await printEnrollmentSummary("State: Ready at msg_1");

  // 6. Cycle 2: msg_1 -> wait_1 (Email 1 sent)
  // Should send in-memory batch: 100 in Run 1, 20 in Run 2.
  await runCycleUntilEmpty("Cycle 2 (msg_1 -> wait_1)");
  await printEnrollmentSummary("State: Paused at wait_1");

  // 7. Cycle 3: wait_1 -> msg_2 (Calculates wait delay and schedules msg_2 for +1 minute)
  await runCycleUntilEmpty("Cycle 3 (wait_1 -> msg_2)");
  await printEnrollmentSummary("State: Paused at msg_2 (1-minute wait scheduled)");

  // 8. Wait for the 1-minute delay to elapse
  console.log("\n[SLEEP] Waiting 65 seconds for the 1-minute wait delay to elapse...");
  await sleep(65000);
  console.log("[SLEEP] Wait finished.");

  // 9. Cycle 4: msg_2 -> wait_slot (Email 2 sent)
  // Should send in-memory batch: 100 in Run 1, 20 in Run 2.
  await runCycleUntilEmpty("Cycle 4 (msg_2 -> wait_slot)");
  await printEnrollmentSummary("State: Ready at wait_slot");

  // 10. Cycle 5: wait_slot -> msg_3 (Calculates optimal slot and schedules msg_3)
  await runCycleUntilEmpty("Cycle 5 (wait_slot -> msg_3)");
  await printEnrollmentSummary("State: Paused at msg_3 (Optimal slot scheduled)");

  // Verify next_evaluation_at timing
  const [sampleSlotEnrollment] = await sql`
    SELECT next_evaluation_at FROM crm_sequence_enrollments WHERE sequence_id = ${sequenceId} LIMIT 1;
  `;
  let slotEval: Date | null = null;
  if (sampleSlotEnrollment?.next_evaluation_at) {
    slotEval = new Date(sampleSlotEnrollment.next_evaluation_at);
    const diffSecondsSlot = (slotEval.getTime() - Date.now()) / 1000;
    console.log(`Slot wait verification: next_evaluation_at scheduled for ${slotEval.toUTCString()} (in ${diffSecondsSlot.toFixed(1)} seconds)`);
  }

  // 11. Run Cycle 5 again BEFORE the slot is active to verify it doesn't process early
  console.log("\n[VERIFY] Executing runner early (before slot window opens) to prove gating works...");
  const resEarly = await triggerSequenceProcess();
  console.log(`Early Execution Output: processed ${resEarly.processed} enrollments (Expected: 0)`);

  // 12. Wait for the slot window to open (remaining seconds)
  const waitTimeMs = Math.max(0, ((slotEval ? slotEval.getTime() : Date.now()) - Date.now()) + 5000); // add 5s buffer
  console.log(`\n[SLEEP] Waiting ${Math.ceil(waitTimeMs / 1000)} seconds for slot window to open...`);
  await sleep(waitTimeMs);
  console.log("[SLEEP] Wait finished.");

  // 13. Cycle 6: msg_3 -> complete (Email 3 sent inside the optimal slot!)
  // Should send in-memory batch: 100 in Run 1, 20 in Run 2.
  await runCycleUntilEmpty("Cycle 6 (msg_3 -> complete inside slot window)");
  await printEnrollmentSummary("State: Completed");

  // 14. Query Mailpit for sent emails
  console.log("\nQuerying Mailpit for sent emails...");
  const mailpitRes = await fetch("http://127.0.0.1:54324/api/v1/messages?limit=500");
  const mailpitData = await mailpitRes.json();
  const testEmails = mailpitData.messages.filter((m: any) => m.Subject.includes(UNIQUE));

  console.log(`\nFound ${testEmails.length} emails matching unique run ${UNIQUE} (Expected: 360)`);

} catch (err) {
  console.error("Error in test script:", err);
} finally {
  console.log("\nCleaning up test data...");
  if (sequenceId) {
    await sql`DELETE FROM crm_sequence_enrollments WHERE sequence_id = ${sequenceId};`;
    await sql`DELETE FROM crm_campaign_sends WHERE sequence_id = ${sequenceId};`;
    await sql`DELETE FROM crm_sequences WHERE id = ${sequenceId};`;
  }
  if (leadIds.length > 0) {
    await sql`DELETE FROM crm_leads WHERE id = ANY(${leadIds});`;
  }
  await sql.end();
  console.log("Cleanup complete!");
}
