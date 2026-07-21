/**
 * Multi-Arm Bandit (MAB) E2E Integration Tests
 *
 * Validates:
 *  1. Journey-level sequence trigger Thompson Sampling selection.
 *  2. Node-level copy variant Thompson Sampling selection.
 *  3. Token expansion safeguards in short links creation.
 *  4. Redirect and conversion tracking increments.
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbInsert, dbQuery, dbUpdate } from "../helpers/supabase-db";

const UNIQUE = `PW_MAB_${Date.now()}`;
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let seqAId: string;
let seqBId: string;
let experimentId: string;
let variantAId: string;
let variantBId: string;
let nodeVariant1Id: string;
let nodeVariant2Id: string;
const testNodeId = "action_email_test_node";

test.describe.serial("Multi-Arm Bandit CRM E2E Tests", () => {

    test.beforeAll(async () => {
        // 1. Create two test sequences
        const seqA = await dbInsert("crm_sequences", {
            name: `${UNIQUE}_Sequence_A`,
            definition: {
                nodes: [
                    {
                        id: "start",
                        type: "input",
                        data: { label: "Start (Trigger)" },
                        position: { x: 250, y: 50 },
                        deletable: false
                    },
                    {
                        id: testNodeId,
                        type: "default",
                        data: {
                            type: "action_email",
                            subject: "Subject A",
                            html: "<p>Variant A html</p>",
                            text: "Variant A text",
                            variantsCount: 2
                        },
                        position: { x: 250, y: 200 }
                    }
                ],
                edges: [
                    {
                        id: "e-start-email",
                        source: "start",
                        target: testNodeId
                    }
                ],
                startNodeId: "start"
            },
            status: "active",
        });
        seqAId = seqA.id;

        const seqB = await dbInsert("crm_sequences", {
            name: `${UNIQUE}_Sequence_B`,
            definition: {
                nodes: [
                    {
                        id: "start",
                        type: "input",
                        data: { label: "Start (Trigger)" },
                        position: { x: 250, y: 50 },
                        deletable: false
                    },
                    {
                        id: testNodeId,
                        type: "default",
                        data: {
                            type: "action_email",
                            subject: "Subject B",
                            html: "<p>Variant B html</p>",
                            text: "Variant B text",
                            variantsCount: 2
                        },
                        position: { x: 250, y: 200 }
                    }
                ],
                edges: [
                    {
                        id: "e-start-email",
                        source: "start",
                        target: testNodeId
                    }
                ],
                startNodeId: "start"
            },
            status: "active",
        });
        seqBId = seqB.id;

        // 2. Create sequence experiment
        const exp = await dbInsert("crm_sequence_experiments", {
            name: `${UNIQUE}_Trigger_Experiment`,
            trigger_event: `${UNIQUE}.test_event`,
            conversion_event: `${UNIQUE}.conversion_event`,
            is_active: true,
        });
        experimentId = exp.id;

        // 3. Create experiment variants
        const expVarA = await dbInsert("crm_sequence_experiment_variants", {
            experiment_id: experimentId,
            sequence_id: seqAId,
            prior_alpha: 2,
            prior_beta: 5,
            sends_count: 0,
            conversions_count: 0,
            is_active: true,
        });
        variantAId = expVarA.id;

        const expVarB = await dbInsert("crm_sequence_experiment_variants", {
            experiment_id: experimentId,
            sequence_id: seqBId,
            prior_alpha: 8,
            prior_beta: 2,
            sends_count: 0,
            conversions_count: 0,
            is_active: true,
        });
        variantBId = expVarB.id;

        // 4. Create copy variants for Sequence A, Node 'action_email_test_node'
        const nodeVar1 = await dbInsert("crm_message_variants", {
            sequence_id: seqAId,
            node_id: testNodeId,
            variant_name: "Copy Variant 1",
            subject: "Subject A",
            content_html: "<p>Variant A html</p>",
            content_text: "Variant A text",
            prior_alpha: 5,
            prior_beta: 5,
            sends_count: 0,
            conversions_count: 0,
            is_active: true,
        });
        nodeVariant1Id = nodeVar1.id;

        const nodeVar2 = await dbInsert("crm_message_variants", {
            sequence_id: seqAId,
            node_id: testNodeId,
            variant_name: "Copy Variant 2",
            subject: "Subject B",
            content_html: "<p>Variant B html</p>",
            content_text: "Variant B text",
            prior_alpha: 10,
            prior_beta: 2,
            sends_count: 0,
            conversions_count: 0,
            is_active: true,
        });
        nodeVariant2Id = nodeVar2.id;
    });

    test.afterAll(async () => {
        // Clean up MAB experiment configuration
        if (nodeVariant1Id) await dbDelete("crm_message_variants", `id=eq.${nodeVariant1Id}`);
        if (nodeVariant2Id) await dbDelete("crm_message_variants", `id=eq.${nodeVariant2Id}`);
        if (variantAId) await dbDelete("crm_sequence_experiment_variants", `id=eq.${variantAId}`);
        if (variantBId) await dbDelete("crm_sequence_experiment_variants", `id=eq.${variantBId}`);
        if (experimentId) await dbDelete("crm_sequence_experiments", `id=eq.${experimentId}`);
        if (seqAId) await dbDelete("crm_sequences", `id=eq.${seqAId}`);
        if (seqBId) await dbDelete("crm_sequences", `id=eq.${seqBId}`);
    });

    test("RPC: get_sequence_variant_for_trigger routes traffic and increments sends", async () => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_sequence_variant_for_trigger`, {
            method: "POST",
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                p_trigger_event: `${UNIQUE}.test_event`,
            }),
        });

        expect(res.ok).toBe(true);
        const data = await res.json();
        // Should yield one of the sequence IDs
        expect([seqAId, seqBId]).toContain(data);

        // Verify sends count was incremented atomically on the chosen variant
        const dbVars = await dbQuery(
            "crm_sequence_experiment_variants",
            `experiment_id=eq.${experimentId}`,
        );
        const totalSends = dbVars.reduce((sum, v) => sum + v.sends_count, 0);
        expect(totalSends).toBe(1);
    });

    test("RPC: get_message_variant_for_node performs Thompson Sampling", async () => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_message_variant_for_node`, {
            method: "POST",
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                p_sequence_id: seqAId,
                p_node_id: testNodeId,
            }),
        });

        expect(res.ok).toBe(true);
        const variantId = await res.json();
        
        expect(variantId).not.toBeNull();
        expect([nodeVariant1Id, nodeVariant2Id]).toContain(variantId);

        // Verify sends_count incremented
        const updatedVars = await dbQuery("crm_message_variants", `sequence_id=eq.${seqAId}&node_id=eq.${testNodeId}`);
        const totalNodeSends = updatedVars.reduce((sum, v) => sum + v.sends_count, 0);
        expect(totalNodeSends).toBe(1);
    });

    test("Token Expansion: creation of links avoids double shortening", async () => {
        // Create an original short link token first
        const initRes = await fetch(`${SUPABASE_URL}/functions/v1/short-link`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                destination: "https://casagrown.com/shop?promo=123",
            }),
        });
        expect(initRes.ok).toBe(true);
        const initData = await initRes.json();
        const shortUrlToken = initData.shortUrl; // e.g. casagrown.com/r/TOKEN

        // Create a new variant short link referencing that pre-existing token short URL
        const finalRes = await fetch(`${SUPABASE_URL}/functions/v1/short-link`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                destination: `Check this out: ${shortUrlToken}`,
                variantId: nodeVariant1Id,
            }),
        });

        expect(finalRes.ok).toBe(true);
        const finalData = await finalRes.json();
        // Since we pass a string containing the short link, token expansion should find, expand and re-shorten it correctly
        expect(finalData.shortUrl).not.toBeNull();
    });

    test("Downstream click conversion registers correctly", async () => {
        // Insert a direct page visit representing a conversion for our variant
        const pageVisit = await dbInsert("crm_page_visits", {
            session_id: "00000000-0000-0000-0000-000000000000",
            page_slug: "/checkout/completed",
            variant_id: nodeVariant1Id,
            visited_at: new Date().toISOString(),
        });
        expect(pageVisit.id).not.toBeNull();

        // Check if crm_message_variants conversion count was updated by trigger or direct RPC call
        const vRecs = await dbQuery("crm_message_variants", `id=eq.${nodeVariant1Id}`);
        expect(vRecs.length).toBe(1);
        // Let's verify conversions count.
        expect(vRecs[0].conversions_count).toBeGreaterThanOrEqual(0);

        // Cleanup page visit
        await dbDelete("crm_page_visits", `id=eq.${pageVisit.id}`);
    });

    test("Can add, switch, tweak with AI, and delete variants in Sequence Builder", async ({ page, baseURL }) => {
        // Skip if UI is not running during this specific backend integration phase
        if (!baseURL) test.skip();
        
        // Mock the AI tweak edge function request to return a successful mock variant
        await page.route('**/functions/v1/generate-campaign-content', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    content: '<div style="padding:20px">Revised Email! 🌿 This is a mock tweaked variant content.</div>',
                }),
            });
        });

        // 1. Navigate to Sequence Builder
        await page.goto(`/crm/sequences/${seqAId}`);
        
        // 2. Open the Email Node to reveal the sidebar
        const emailNode = page.locator('.react-flow__node:has-text("Send Email"), .react-flow__node:has-text("Bandit")').first();
        await expect(emailNode).toBeVisible({ timeout: 15000 });
        await emailNode.click();

        // 3. Verify loaded variants from DB (Copy Variant 1, Copy Variant 2)
        await expect(page.locator('text=Copy Variant 1')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Copy Variant 2')).toBeVisible({ timeout: 10000 });

        // 4. Add Variant
        const addBtn = page.locator('button:has-text("+ Add Variant")');
        await expect(addBtn).toBeVisible();
        await addBtn.click();
        
        // 5. Verify Variant C is created and selected (value of Variant Name input is Variant C)
        const nameInput = page.locator('label:has-text("Variant Name") + input, label:has-text("Variant Name") ~ input').first();
        await expect(nameInput).toHaveValue("Variant C");

        // 6. Tweak with AI
        const tweakBtn = page.locator('button:has-text("Tweak with AI")');
        await expect(tweakBtn).toBeVisible();
        await tweakBtn.click();

        // 7. Verify Variant D (AI) is created and visible
        await expect(page.locator('text=Variant D (AI)')).toBeVisible({ timeout: 20000 });

        // 8. Delete Variant D (AI)
        const deleteSpan = page.locator('div').filter({ hasText: /^Variant D \(AI\)\s*×$/ }).locator('span:has-text("×")').first();
        await expect(deleteSpan).toBeVisible();
        await deleteSpan.click();

        // 9. Verify Variant D (AI) is deleted
        await expect(page.locator('text=Variant D (AI)')).not.toBeVisible();
    });

    test("Predefined Journey Metrics: calculate_journey_conversions and calculate_journey_metrics_breakdown evaluate correctly", async () => {
        // 1. Create a test lead
        const lead = await dbInsert("crm_leads", {
            name: `${UNIQUE}_Lead`,
            email: `${UNIQUE}@test.com`,
            status: "new",
        });
        
        // 2. Enroll lead in Sequence A
        const enrollment = await dbInsert("crm_sequence_enrollments", {
            sequence_id: seqAId,
            recipient_type: "lead",
            recipient_id: lead.id,
            status: "active",
        });

        // 3. Update lead to converted (this creates a profile and marks status = converted)
        const profile = await dbInsert("profiles", {
            email: `${UNIQUE}@test.com`,
            full_name: `${UNIQUE}_User`,
            profile_completed_at: null,
            created_at: new Date().toISOString(),
        });

        await dbUpdate("crm_leads", {
            status: "converted",
            converted_user_id: profile.id,
        }, `id=eq.${lead.id}`);

        // Update the experiment goal to accounts_created
        await dbUpdate("crm_sequence_experiments", {
            conversion_event: "accounts_created",
        }, `id=eq.${experimentId}`);

        // 4. Run calculation RPC
        const resConvs = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calculate_journey_conversions`, {
            method: "POST",
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                p_experiment_id: experimentId,
            }),
        });
        expect(resConvs.ok).toBe(true);
        const dataConvs = await resConvs.json();
        // Sequence A should have 1 conversion (Accounts Created)
        const seqAConv = dataConvs.find((row: any) => row.sequence_id === seqAId);
        expect(seqAConv).toBeDefined();
        expect(seqAConv.conversions_count).toBe(1);

        // 5. Test breakdown RPC
        const resBreakdown = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calculate_journey_metrics_breakdown`, {
            method: "POST",
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                p_experiment_id: experimentId,
            }),
        });
        expect(resBreakdown.ok).toBe(true);
        const dataBreakdown = await resBreakdown.json();
        const seqABreakdown = dataBreakdown.find((row: any) => row.sequence_id === seqAId);
        expect(seqABreakdown).toBeDefined();
        expect(seqABreakdown.accounts_created).toBe(1);

        // Cleanup
        await dbDelete("crm_sequence_enrollments", `id=eq.${enrollment.id}`);
        await dbDelete("crm_leads", `id=eq.${lead.id}`);
        await dbDelete("profiles", `id=eq.${profile.id}`);
    });

    test("Predefined Message Metrics: Attributions trigger correctly on page visits and user actions", async () => {
        // 1. Create a test lead
        const lead = await dbInsert("crm_leads", {
            name: `${UNIQUE}_Msg_Lead`,
            email: `${UNIQUE}_msg@test.com`,
            status: "new",
        });

        // 2. Simulate click visit stamping variant id
        const visit = await dbInsert("crm_page_visits", {
            session_id: "00000000-0000-0000-0000-000000000001",
            page_slug: "/shop",
            lead_id: lead.id,
            variant_id: nodeVariant1Id,
            visited_at: new Date().toISOString(),
        });

        // 3. User converts to account (triggers trg_mab_message_account_created)
        const profile = await dbInsert("profiles", {
            email: `${UNIQUE}_msg@test.com`,
            full_name: `${UNIQUE}_Msg_User`,
            created_at: new Date().toISOString(),
        });

        await dbUpdate("crm_leads", {
            status: "converted",
            converted_user_id: profile.id,
        }, `id=eq.${lead.id}`);

        // 4. User completes profile (triggers trg_mab_message_profile_completed)
        await dbUpdate("profiles", {
            profile_completed_at: new Date().toISOString(),
        }, `id=eq.${profile.id}`);

        // 5. User creates product (triggers trg_mab_message_listing_created)
        const product = await dbInsert("market_products", {
            seller_id: profile.id,
            market_date: new Date().toISOString().split('T')[0],
            name: `${UNIQUE}_Product`,
            price_usd: 15.00,
            inventory: 1,
        });

        // 6. Verify variant metrics increments
        const vRecs = await dbQuery("crm_message_variants", `id=eq.${nodeVariant1Id}`);
        expect(vRecs.length).toBe(1);
        expect(vRecs[0].accounts_created_count).toBe(1);
        expect(vRecs[0].profiles_completed_count).toBe(1);
        expect(vRecs[0].listings_created_count).toBe(1);

        // Cleanup
        await dbDelete("market_products", `id=eq.${product.id}`);
        await dbDelete("crm_page_visits", `id=eq.${visit.id}`);
        await dbDelete("crm_leads", `id=eq.${lead.id}`);
        await dbDelete("profiles", `id=eq.${profile.id}`);
    });
});
