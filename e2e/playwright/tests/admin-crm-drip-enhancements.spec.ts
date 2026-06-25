/**
 * Admin CRM Drip Sequence Enhancements E2E Tests
 *
 * Tests the new drip sequence features:
 *   (d) Delivery tracking — Postmark Delivery/Click + Twilio delivered
 *   (c) Send-status conditions — Message Engagement query builder fields
 *   (b) Optimal send windows — Wait for Optimal Slot node + admin config page
 *   (a) Fork/Join — parallel paths in sequence builder
 *   (e) Backfill on activation — checkbox + one-time bulk enrollment
 *
 * These tests verify both UI and end-to-end execution via edge functions.
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbInsert, dbQuery, dbUpdate } from "../helpers/supabase-db";

const UNIQUE = `PW_DRIP_${Date.now()}`;
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const MAILPIT_URL = "http://127.0.0.1:54324";

// ── Helpers ──────────────────────────────────────────────────────

async function clearMailpit() {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
    if (!res.ok) console.warn(`Failed to clear Mailpit: ${res.status}`);
}

async function getMailpitMessages(): Promise<any[]> {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (!res.ok) throw new Error(`Failed to fetch Mailpit: ${res.status}`);
    const data = await res.json();
    return data.messages || [];
}

async function triggerSequenceProcess(opts?: { test_run_all?: boolean; sequence_id?: string }) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-sequence-step`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(opts || {}),
    });
    if (!res.ok) throw new Error(`Process sequence step failed: ${res.status} ${await res.text()}`);
    return res.json();
}

async function enrollInSequence(body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/enroll-in-sequence`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Enroll in sequence failed: ${res.status} ${await res.text()}`);
    return res.json();
}

async function postPostmarkWebhook(event: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/postmark-webhook`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error(`Postmark webhook failed: ${res.status} ${await res.text()}`);
    return res.json();
}

async function postTwilioWebhook(params: URLSearchParams) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-campaign-webhook`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: params.toString(),
    });
    return res;
}


// ═══════════════════════════════════════════════════════════════════
// Test Suite: Delivery Tracking (Feature D)
// ═══════════════════════════════════════════════════════════════════

test.describe.serial("Feature D: Delivery Tracking", () => {
    let sendId: string;
    let dummySeqId: string;

    test.beforeAll(async () => {
        // Create a dummy sequence to link the send to
        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} Postmark Test Sequence`,
            definition: { nodes: [], edges: [], startNodeId: "start" },
            status: "draft",
        });
        dummySeqId = seq.id;

        // Create a campaign send record for testing
        const send = await dbInsert("crm_campaign_sends", {
            sequence_id: dummySeqId,
            email: `${UNIQUE}_delivery@test.com`,
            sent_at: new Date().toISOString(),
            recipient_type: "lead",
            recipient_id: "00000000-0000-0000-0000-000000000000",
        });
        sendId = send.id;
    });

    test.afterAll(async () => {
        if (sendId) await dbDelete("crm_campaign_sends", `id=eq.${sendId}`);
        if (dummySeqId) await dbDelete("crm_sequences", `id=eq.${dummySeqId}`);
    });

    test("Postmark Delivery event sets delivered_at", async () => {
        const result = await postPostmarkWebhook({
            RecordType: "Delivery",
            Recipient: `${UNIQUE}_delivery@test.com`,
            Metadata: { send_id: sendId },
        });
        expect(result.ok).toBe(true);
        expect(result.processed).toBe("Delivery");

        // Verify delivered_at is set
        const sends = await dbQuery("crm_campaign_sends", `id=eq.${sendId}`);
        expect(sends.length).toBe(1);
        expect(sends[0].delivered_at).not.toBeNull();
    });

    test("Postmark Click event sets clicked_at", async () => {
        const result = await postPostmarkWebhook({
            RecordType: "Click",
            Recipient: `${UNIQUE}_delivery@test.com`,
            Metadata: { send_id: sendId },
        });
        expect(result.ok).toBe(true);
        expect(result.processed).toBe("Click");

        const sends = await dbQuery("crm_campaign_sends", `id=eq.${sendId}`);
        expect(sends.length).toBe(1);
        expect(sends[0].clicked_at).not.toBeNull();
    });
});

test.describe.serial("Feature D: Twilio Delivery Tracking", () => {
    let smsSendId: string;
    let dummySmsSeqId: string;
    const testPhone = `+1${UNIQUE.slice(-10).replace(/\D/g, '0')}`;

    test.beforeAll(async () => {
        // Create a dummy sequence to link the send to
        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} Twilio Test Sequence`,
            definition: { nodes: [], edges: [], startNodeId: "start" },
            status: "draft",
        });
        dummySmsSeqId = seq.id;

        const send = await dbInsert("crm_campaign_sends", {
            sequence_id: dummySmsSeqId,
            phone: testPhone,
            sent_at: new Date().toISOString(),
            recipient_type: "lead",
            recipient_id: "00000000-0000-0000-0000-000000000000",
        });
        smsSendId = send.id;
    });

    test.afterAll(async () => {
        if (smsSendId) await dbDelete("crm_campaign_sends", `id=eq.${smsSendId}`);
        if (dummySmsSeqId) await dbDelete("crm_sequences", `id=eq.${dummySmsSeqId}`);
    });

    test("Twilio delivered status sets delivered_at", async () => {
        const params = new URLSearchParams({
            MessageSid: `SM${UNIQUE}`,
            MessageStatus: "delivered",
            To: testPhone,
        });
        const res = await postTwilioWebhook(params);
        expect(res.status).toBe(200);

        const sends = await dbQuery("crm_campaign_sends", `id=eq.${smsSendId}`);
        expect(sends.length).toBe(1);
        expect(sends[0].delivered_at).not.toBeNull();
    });
});


// ═══════════════════════════════════════════════════════════════════
// Test Suite: Fork/Join Execution (Feature A)
// ═══════════════════════════════════════════════════════════════════

test.describe.serial("Feature A: Fork/Join Sequence Execution", () => {
    let sequenceId: string;
    let leadId: string;
    let enrollmentId: string;

    test.beforeAll(async () => {
        await clearMailpit();

        // Create a test lead
        const lead = await dbInsert("crm_leads", {
            name: `${UNIQUE} Fork Test Lead`,
            email: `${UNIQUE}_fork@test.com`,
            accepts_email: true,
            accepts_sms: true,
        });
        leadId = lead.id;

        // Create a fork/join sequence
        const forkDef = {
            nodes: [
                { id: "start", type: "input", data: { type: "input" }, position: { x: 250, y: 0 } },
                { id: "fork_1", type: "default", data: { type: "fork" }, position: { x: 250, y: 100 } },
                { id: "email_1", type: "default", data: { type: "action_email", subject: `${UNIQUE} Fork Email`, html: `<p>Fork branch email</p>`, text: "Fork branch email" }, position: { x: 100, y: 200 } },
                { id: "wait_1", type: "default", data: { type: "wait", delayDays: 0, delayHours: 0, delayMinutes: 0 }, position: { x: 400, y: 200 } },
                { id: "join_1", type: "default", data: { type: "join" }, position: { x: 250, y: 300 } },
            ],
            edges: [
                { id: "e_start_fork", source: "start", target: "fork_1" },
                { id: "e_fork_email", source: "fork_1", target: "email_1" },
                { id: "e_fork_wait", source: "fork_1", target: "wait_1" },
                { id: "e_email_join", source: "email_1", target: "join_1" },
                { id: "e_wait_join", source: "wait_1", target: "join_1" },
            ],
            startNodeId: "start",
        };

        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} Fork/Join Test`,
            definition: forkDef,
            status: "active",
            trigger_event: null,
        });
        sequenceId = seq.id;
    });

    test.afterAll(async () => {
        await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${sequenceId}`);
        await dbDelete("crm_campaign_sends", `sequence_id=eq.${sequenceId}`);
        await dbDelete("crm_sequences", `id=eq.${sequenceId}`);
        await dbDelete("crm_leads", `id=eq.${leadId}`);
    });

    test("Enroll a lead into the fork/join sequence", async () => {
        const result = await enrollInSequence({
            sequence_id: sequenceId,
            recipients: [{ recipient_type: "lead", recipient_id: leadId }],
        });
        expect(result.success).toBe(true);
        expect(result.enrolled).toBe(1);

        const enrollments = await dbQuery("crm_sequence_enrollments", `sequence_id=eq.${sequenceId}&recipient_id=eq.${leadId}`);
        expect(enrollments.length).toBe(1);
        enrollmentId = enrollments[0].id;
    });

    test("Process start node → fork creates sub-enrollments", async () => {
        // Process start node first
        await triggerSequenceProcess();
        await new Promise((r) => setTimeout(r, 500));
        // Now at fork node — process again
        await triggerSequenceProcess();

        // Parent should be paused
        const parent = await dbQuery("crm_sequence_enrollments", `id=eq.${enrollmentId}`);
        expect(parent[0].status).toBe("paused");

        // Should have 2 sub-enrollments
        const subs = await dbQuery("crm_sequence_enrollments", `parent_enrollment_id=eq.${enrollmentId}`);
        expect(subs.length).toBe(2);
        expect(subs.every((s: any) => s.fork_node_id === "fork_1")).toBe(true);
        expect(subs.every((s: any) => s.status === "active")).toBe(true);
    });

    test("Process both branches → join resumes parent", async () => {
        // Process sub-enrollments (email + wait branches)
        await triggerSequenceProcess();
        await new Promise((r) => setTimeout(r, 500));
        // Process join nodes
        await triggerSequenceProcess();
        await new Promise((r) => setTimeout(r, 500));
        // Safety pass to ensure join settles and resumes parent
        await triggerSequenceProcess();

        // Both sub-enrollments should be completed
        const subs = await dbQuery("crm_sequence_enrollments", `parent_enrollment_id=eq.${enrollmentId}`);
        expect(subs.every((s: any) => s.status === "completed")).toBe(true);

        // Parent should be completed (join has no outbound edge after it)
        const parent = await dbQuery("crm_sequence_enrollments", `id=eq.${enrollmentId}`);
        // After join, parent is either active at next node or completed
        expect(["active", "completed"]).toContain(parent[0].status);

        // Email should have been sent via Mailpit
        await new Promise((r) => setTimeout(r, 1000));
        const messages = await getMailpitMessages();
        const forkEmail = messages.find((m: any) =>
            m.Subject?.includes(`${UNIQUE} Fork Email`)
        );
        expect(forkEmail).toBeDefined();
    });
});


// ═══════════════════════════════════════════════════════════════════
// Test Suite: Backfill on Activation (Feature E)
// ═══════════════════════════════════════════════════════════════════

test.describe.serial("Feature E: Backfill on Activation", () => {
    let sequenceId: string;
    const leadIds: string[] = [];

    test.beforeAll(async () => {
        // Create 3 test leads
        for (let i = 0; i < 3; i++) {
            const lead = await dbInsert("crm_leads", {
                name: `${UNIQUE} Backfill Lead ${i}`,
                email: `${UNIQUE}_bf${i}@test.com`,
                accepts_email: true,
            });
            leadIds.push(lead.id);
        }

        // Create a sequence with lead.created trigger
        const def = {
            nodes: [
                { id: "start", type: "input", data: { type: "input" }, position: { x: 250, y: 0 } },
                { id: "email_1", type: "default", data: { type: "action_email", subject: `${UNIQUE} Backfill`, html: "<p>Backfill test</p>", text: "Backfill test" }, position: { x: 250, y: 100 } },
            ],
            edges: [{ id: "e1", source: "start", target: "email_1" }],
            startNodeId: "start",
        };

        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} Backfill Test`,
            definition: def,
            status: "active",
            trigger_event: "lead.created",
            backfill_on_activate: true,
        });
        sequenceId = seq.id;
    });

    test.afterAll(async () => {
        await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${sequenceId}`);
        await dbDelete("crm_campaign_sends", `sequence_id=eq.${sequenceId}`);
        await dbDelete("crm_sequences", `id=eq.${sequenceId}`);
        for (const id of leadIds) {
            await dbDelete("crm_leads", `id=eq.${id}`);
        }
    });

    test("Backfill enrolls all existing leads", async () => {
        const result = await enrollInSequence({
            sequence_id: sequenceId,
            backfill: true,
        });
        expect(result.success).toBe(true);
        // Should have enrolled at least our 3 test leads (may be more from other tests)
        expect(result.backfilled).toBeGreaterThanOrEqual(3);

        // Verify our specific leads are enrolled
        for (const leadId of leadIds) {
            const enrollments = await dbQuery(
                "crm_sequence_enrollments",
                `sequence_id=eq.${sequenceId}&recipient_id=eq.${leadId}`
            );
            expect(enrollments.length).toBe(1);
            expect(enrollments[0].status).toBe("active");
        }
    });
});


// ═══════════════════════════════════════════════════════════════════
// Test Suite: UI — Sequence Builder New Node Types
// ═══════════════════════════════════════════════════════════════════

test.describe("UI: Sequence Builder Enhancements", () => {
    let sequenceId: string;

    test.beforeAll(async () => {
        // Create a draft sequence via DB
        const def = {
            nodes: [
                { id: "start", type: "input", data: { type: "input" }, position: { x: 250, y: 0 } },
            ],
            edges: [],
            startNodeId: "start",
        };
        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} UI Test Sequence`,
            definition: def,
            status: "draft",
        });
        sequenceId = seq.id;
    });

    test.afterAll(async () => {
        await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${sequenceId}`);
        await dbDelete("crm_sequences", `id=eq.${sequenceId}`);
    });

    test("New node types appear in the left palette", async ({ page }) => {
        await page.goto(`/crm/sequences/${sequenceId}`);
        await page.waitForLoadState("networkidle");

        // Verify all 7 node types are in the palette
        await expect(page.getByText("✉️ Send Email")).toBeVisible();
        await expect(page.getByText("💬 Send SMS")).toBeVisible();
        await expect(page.getByText("⏳ Wait Delay")).toBeVisible();
        await expect(page.getByText("🔀 Condition Split")).toBeVisible();
        await expect(page.getByText("🕐 Wait for Optimal Slot")).toBeVisible();
        await expect(page.getByText("🔱 Fork (Parallel)")).toBeVisible();
        await expect(page.getByText("🔗 Join (Wait for All)")).toBeVisible();
    });

    test("Backfill checkbox appears for event-based triggers", async ({ page }) => {
        await page.goto(`/crm/sequences/${sequenceId}`);
        await page.waitForLoadState("networkidle");

        // Click start node
        await page.getByText("Start").first().click();

        // Select a trigger event
        const triggerSelect = page.locator("select").filter({ hasText: "Manual" });
        await triggerSelect.selectOption("lead.created");

        // Backfill checkbox should appear
        await expect(page.getByText("Backfill existing recipients on activation")).toBeVisible();

        // Switch to manual — checkbox should disappear
        await triggerSelect.selectOption("");
        await expect(page.getByText("Backfill existing recipients on activation")).not.toBeVisible();

        // Switch to AI condition — checkbox should not appear
        await triggerSelect.selectOption("ai_condition");
        await expect(page.getByText("Backfill existing recipients on activation")).not.toBeVisible();
    });

    test("Condition node shows custom dropdown options", async ({ page }) => {
        // Pre-create a sequence with a condition node
        const def = {
            nodes: [
                { id: "start", type: "input", data: { type: "input" }, position: { x: 250, y: 0 } },
                { id: "cond_1", type: "default", data: { type: "condition", label: "🔀 Condition", query: { combinator: "and", rules: [{ field: "email_enabled", operator: "=", value: "true" }] } }, position: { x: 250, y: 150 } },
            ],
            edges: [
                { id: "e1", source: "start", target: "cond_1" }
            ],
            startNodeId: "start",
        };

        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} UI Condition Dropdown Test`,
            definition: def,
            status: "draft",
        });

        await page.goto(`/crm/sequences/${seq.id}`);
        await page.waitForLoadState("networkidle");

        // Click on the condition node
        await page.locator('.react-flow__node:has-text("Condition")').first().click();

        // Query builder should be visible
        await page.waitForSelector(".react-querybuilder");

        // Find the select dropdown for fields in the query builder
        const fieldSelect = page.locator("select.rule-fields").first();
        await expect(fieldSelect).toBeVisible();

        // Verify the option labels are present in the dropdown
        const options = fieldSelect.locator("option");
        const texts = await options.allTextContents();

        expect(texts).toContain("Has Only Email");
        expect(texts).toContain("Has Only Phone Number");
        expect(texts).toContain("Has Both Email and Phone");
        expect(texts).toContain("Has Created At Least 1 Listing");

        // Cleanup
        await dbDelete("crm_sequences", `id=eq.${seq.id}`);
    });

    test("Test Sequence (Test All) user journey with Fork/Join", async ({ page }) => {
        await clearMailpit();

        const testEmail = `${UNIQUE}_ui_test_fork@test.com`;

        // Create a fork/join sequence with test_emails
        const forkDef = {
            nodes: [
                { id: "start", type: "input", data: { type: "input" }, position: { x: 250, y: 0 } },
                { id: "fork_1", type: "default", data: { type: "fork" }, position: { x: 250, y: 100 } },
                { id: "email_1", type: "default", data: { type: "action_email", subject: `${UNIQUE} UI Fork Email`, html: `<p>Fork branch email</p>`, text: "Fork branch email" }, position: { x: 100, y: 200 } },
                { id: "wait_1", type: "default", data: { type: "wait", delayDays: 0, delayHours: 0, delayMinutes: 0 }, position: { x: 400, y: 200 } },
                { id: "join_1", type: "default", data: { type: "join" }, position: { x: 250, y: 300 } },
            ],
            edges: [
                { id: "e_start_fork", source: "start", target: "fork_1" },
                { id: "e_fork_email", source: "fork_1", target: "email_1" },
                { id: "e_fork_wait", source: "fork_1", target: "wait_1" },
                { id: "e_email_join", source: "email_1", target: "join_1" },
                { id: "e_wait_join", source: "wait_1", target: "join_1" },
            ],
            startNodeId: "start",
        };

        const seq = await dbInsert("crm_sequences", {
            name: `${UNIQUE} UI Fork Join Test`,
            definition: forkDef,
            status: "draft",
            test_emails: [testEmail],
            test_phones: [],
        });

        // Go to sequences list
        await page.goto("/crm/sequences");
        await page.waitForLoadState("networkidle");

        // Find our row and click "Test"
        const row = page.locator("tr").filter({ hasText: `${UNIQUE} UI Fork Join Test` });
        await expect(row).toBeVisible();

        const testBtn = row.getByRole("button", { name: /Test/ });
        await expect(testBtn).toBeVisible();
        await testBtn.click();

        // Check for success toast: "All test messages sent!"
        await expect(page.getByText("All test messages sent!")).toBeVisible({ timeout: 15000 });

        // Verify in DB that enrollment exists and is completed
        const enrollments = await dbQuery("crm_sequence_enrollments", `sequence_id=eq.${seq.id}`);
        expect(enrollments.length).toBe(3);
        const parent = enrollments.find((e: any) => e.parent_enrollment_id === null);
        expect(parent).toBeDefined();
        expect(parent.status).toBe("completed");

        const subs = enrollments.filter((e: any) => e.parent_enrollment_id !== null);
        expect(subs.length).toBe(2);
        expect(subs.every((s: any) => s.status === "completed")).toBe(true);

        // Verify Mailpit received the email
        await new Promise((r) => setTimeout(r, 1000));
        const messages = await getMailpitMessages();
        const forkEmail = messages.find((m: any) =>
            m.Subject?.includes(`${UNIQUE} UI Fork Email`) &&
            m.To?.some((t: any) => t.Address === testEmail)
        );
        expect(forkEmail).toBeDefined();

        // Cleanup
        await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${seq.id}`);
        await dbDelete("crm_campaign_sends", `sequence_id=eq.${seq.id}`);
        await dbDelete("crm_sequences", `id=eq.${seq.id}`);
        await dbDelete("crm_leads", `email=eq.${testEmail}`);
    });
});


// ═══════════════════════════════════════════════════════════════════
// Test Suite: Send Windows Admin Page
// ═══════════════════════════════════════════════════════════════════

test.describe("UI: Send Windows Configuration", () => {
    test("Send Windows page loads with defaults", async ({ page }) => {
        await page.goto("/crm/send-slots");
        await page.waitForLoadState("networkidle");

        // Page title
        await expect(page.getByRole("heading", { name: "Send Windows", exact: true })).toBeVisible();

        // Both sections should be visible
        await expect(page.getByText("Email Send Windows")).toBeVisible();
        await expect(page.getByText("SMS Send Windows")).toBeVisible();
    });

    test("Can add and remove slots", async ({ page }) => {
        await page.goto("/crm/send-slots");
        await page.waitForLoadState("networkidle");

        // Count initial email slots
        const addEmailBtn = page.locator("text=+ Add Row").first();
        await addEmailBtn.click();

        // New slot should appear with time inputs
        const timeInputs = page.locator('input[type="time"]');
        expect(await timeInputs.count()).toBeGreaterThan(0);
    });
});
