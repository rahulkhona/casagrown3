/**
 * Admin CRM Campaigns, Sequences, and RBAC Verification E2E Tests
 *
 * Verifies campaign creation, audience resolution, campaign triggering,
 * follow-up sequence enrollment, and sequence execution (including 0 wait delays)
 * by verifying the emails are successfully received in local Mailpit.
 *
 * Also tests all event-based triggers:
 *   - lead.created (trigger_event = 'lead.created')
 *   - user.first_login (trigger_event = 'user.first_login')
 *   - market_orders.purchase_completed / sale_completed
 *   - ai_condition (using process_ai_condition_enrollments)
 *
 * Also tests Role-Based Access Control (RBAC):
 *   - Full Admin role accesses CRM pages + core admin pages.
 *   - Marketing role is restricted to only CRM pages + Account page,
 *     gets redirected to /unauthorized on other pages, and has a filtered sidebar.
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbInsert, dbQuery, dbUpdate } from "../helpers/supabase-db";

const UNIQUE = `PW_CRM_${Date.now()}`;
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const MAILPIT_URL = "http://127.0.0.1:54324";

// Helper to clear all Mailpit messages
async function clearMailpit() {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
    if (!res.ok) {
        console.warn(`Failed to clear Mailpit: ${res.status} ${await res.text()}`);
    }
}

// Helper to list Mailpit summary messages
async function getMailpitMessages(): Promise<any[]> {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (!res.ok) {
        throw new Error(`Failed to fetch Mailpit messages: ${res.status}`);
    }
    const data = await res.json();
    return data.messages || [];
}

// Helper to fetch the full message payload (HTML, Text, To, Subject, etc.) from Mailpit
async function getFullMailpitMessage(messageId: string): Promise<any> {
    const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch full Mailpit message: ${res.status}`);
    }
    return res.json();
}

// Helper to trigger send-crm-campaign edge function
async function triggerCampaignSend(campaignId: string) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-crm-campaign`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
            campaign_id: campaignId,
            is_test: false,
        }),
    });
    if (!res.ok) {
        throw new Error(`Failed to trigger campaign send: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

// Helper to trigger process-sequence-step edge function
async function triggerSequenceProcess() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-sequence-step`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    if (!res.ok) {
        throw new Error(`Failed to process sequence step: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

// Helper to trigger process_ai_condition_enrollments DB RPC
async function triggerAiConditionEnrollments() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_ai_condition_enrollments`, {
        method: "POST",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
    });
    if (!res.ok) {
        throw new Error(`Failed to run process_ai_condition_enrollments rpc: ${res.status} ${await res.text()}`);
    }
}

// Helper to trigger send-crm-campaign in cron mode (no campaign_id)
async function triggerCampaignCron() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-crm-campaign`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({}),
    });
    if (!res.ok) {
        throw new Error(`Failed to trigger campaign cron: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

// Helper to create a user with a specific marketing role
async function createMarketingUser(email: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email,
            email_confirm: true,
        }),
    });
    if (!res.ok) {
        throw new Error(`Failed to create marketing user in auth: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const userId = data.id;

    const profileExists = await dbQuery("profiles", `id=eq.${userId}`);
    if (profileExists.length === 0) {
        await dbInsert("profiles", {
            id: userId,
            email,
            full_name: "Marketing Agent",
        });
    }

    await dbInsert("staff_members", {
        user_id: userId,
        roles: ["marketing"],
        email,
    });

    return userId;
}

// Helper to clean up created auth user by ID
async function deleteAuthUser(userId: string) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    if (!res.ok) {
        console.warn(`Failed to delete marketing auth user: ${res.status} ${await res.text()}`);
    }
}

// Helper to sign in as a specific user email using magic link verify injection
async function signInAsUser(page: any, email: string) {
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "magiclink", email }),
    });
    if (!linkRes.ok) {
        throw new Error(`generate_link failed: ${linkRes.status} ${await linkRes.text()}`);
    }
    const linkData = await linkRes.json();
    const hashedToken = linkData.hashed_token;

    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: "POST",
        headers: {
            apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            type: "magiclink",
            token_hash: hashedToken,
        }),
    });
    if (!verifyRes.ok) {
        throw new Error(`verify failed: ${verifyRes.status} ${await verifyRes.text()}`);
    }
    const session = await verifyRes.json();

    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1000);

    await page.evaluate(
        ({ cookieKey, accessToken, refreshToken, user }) => {
            const sessionPayload = JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user,
            });

            document.cookie = `${cookieKey}=${encodeURIComponent(sessionPayload)}; path=/; max-age=34560000; samesite=lax`;

            const keys = [
                "sb-127.0.0.1-auth-token",
                "sb-127-auth-token",
                "sb-localhost-auth-token",
                "supabase.auth.token",
            ];
            for (const key of keys) {
                localStorage.setItem(key, sessionPayload);
            }

            localStorage.setItem("casagrown_alpha_ack", "true");
            localStorage.setItem("casagrown_tutorial_done", new Date().toISOString());
            localStorage.setItem("rating_skip_until", new Date(Date.now() + 365 * 86400000).toISOString());
        },
        {
            cookieKey: "sb-127-auth-token",
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            user: session.user,
        }
    );

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);
}

test.describe("Admin CRM Campaigns & Sequences Integration", () => {
    test.describe.configure({ mode: "serial" });

    let lead: any = null;
    let audience: any = null;
    let sequence: any = null;
    let sequence2: any = null;
    let sequence3: any = null;
    let campaign: any = null;
    let campaign2: any = null;
    let order: any = null;
    let targetProfile: any = null;
    let originalCompletedAt: string | null = null;
    let marketingUserId: string | null = null;

    test.beforeEach(async () => {
        // Clear Mailpit to start fresh
        await clearMailpit();
    });

    test.afterEach(async () => {
        // Clean up created database entities in reverse order of dependencies
        if (campaign2) {
            // Clean campaign_sends for campaign2
            try { await dbDelete("crm_campaign_sends", `campaign_id=eq.${campaign2.id}`); } catch (_e) { /* ignore */ }
            await dbDelete("crm_campaigns", `id=eq.${campaign2.id}`);
            campaign2 = null;
        }
        if (campaign) {
            // Clean campaign_sends for campaign
            try { await dbDelete("crm_campaign_sends", `campaign_id=eq.${campaign.id}`); } catch (_e) { /* ignore */ }
            await dbDelete("crm_campaigns", `id=eq.${campaign.id}`);
            campaign = null;
        }
        if (order) {
            await dbDelete("market_orders", `id=eq.${order.id}`);
            order = null;
        }
        if (sequence) {
            // Clean enrollments and campaign_sends for sequence
            try { await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${sequence.id}`); } catch (_e) { /* ignore */ }
            try { await dbDelete("crm_campaign_sends", `sequence_id=eq.${sequence.id}`); } catch (_e) { /* ignore */ }
            await dbDelete("crm_sequences", `id=eq.${sequence.id}`);
            sequence = null;
        }
        if (sequence2) {
            try { await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${sequence2.id}`); } catch (_e) { /* ignore */ }
            try { await dbDelete("crm_campaign_sends", `sequence_id=eq.${sequence2.id}`); } catch (_e) { /* ignore */ }
            await dbDelete("crm_sequences", `id=eq.${sequence2.id}`);
            sequence2 = null;
        }
        if (sequence3) {
            try { await dbDelete("crm_sequence_enrollments", `sequence_id=eq.${sequence3.id}`); } catch (_e) { /* ignore */ }
            try { await dbDelete("crm_campaign_sends", `sequence_id=eq.${sequence3.id}`); } catch (_e) { /* ignore */ }
            await dbDelete("crm_sequences", `id=eq.${sequence3.id}`);
            sequence3 = null;
        }
        if (audience) {
            await dbDelete("crm_audiences", `id=eq.${audience.id}`);
            audience = null;
        }
        if (lead) {
            await dbDelete("crm_leads", `id=eq.${lead.id}`);
            lead = null;
        }
        if (targetProfile && originalCompletedAt !== undefined) {
            await dbUpdate("profiles", `id=eq.${targetProfile.id}`, {
                profile_completed_at: originalCompletedAt,
            });
            targetProfile = null;
            originalCompletedAt = null;
        }
        if (marketingUserId) {
            await dbDelete("profiles", `id=eq.${marketingUserId}`);
            await deleteAuthUser(marketingUserId);
            marketingUserId = null;
        }
    });

    test("verifies solo campaign email sends successfully to Mailpit", async ({ page }) => {
        const leadEmail = `lead.solo.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create a lead
        lead = await dbInsert("crm_leads", {
            name: `Solo Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: "new",
        });

        // 2. Create a dynamic audience targeting this lead
        audience = await dbInsert("crm_audiences", {
            name: `Solo Audience ${UNIQUE}`,
            recipient_type: "leads",
            is_dynamic: true,
            query_sql: `
                SELECT 
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 3. Create a campaign
        const subject = `Solo Promo Subject ${UNIQUE}`;
        campaign = await dbInsert("crm_campaigns", {
            name: `Solo Campaign ${UNIQUE}`,
            channel: "email",
            subject: subject,
            content_html: `<p>Hello {{name}}, welcome to our solo campaign verification!</p>`,
            audience_id: audience.id,
            status: "draft",
        });

        // 4. Trigger campaign send
        const sendResult = await triggerCampaignSend(campaign.id);
        expect(sendResult.processed).toBe(1);

        // 5. Verify email is received in Mailpit
        await page.waitForTimeout(2000);
        const messages = await getMailpitMessages();
        const msg = messages.find(
            (m) =>
                m.Subject === subject &&
                m.To?.some((to: any) => to.Address === leadEmail)
        );
        expect(msg).toBeDefined();

        // 6. Fetch full message content and assert recipients, subject, and body content
        const fullMsg = await getFullMailpitMessage(msg.ID);
        expect(fullMsg.Subject).toBe(subject);
        expect(fullMsg.To).toBeDefined();
        expect(fullMsg.To.length).toBe(1);
        expect(fullMsg.To[0].Address).toBe(leadEmail);
        expect(fullMsg.HTML).toContain(`Hello Solo Lead ${UNIQUE}`);
        expect(fullMsg.HTML).toContain("welcome to our solo campaign verification");
    });

    test("verifies campaign with follow-up sequence triggers and executes steps with 0 wait delays", async ({ page }) => {
        const leadEmail = `lead.seq.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create a lead
        lead = await dbInsert("crm_leads", {
            name: `Seq Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: "new",
        });

        // 2. Create a dynamic audience targeting this lead
        audience = await dbInsert("crm_audiences", {
            name: `Seq Audience ${UNIQUE}`,
            recipient_type: "leads",
            is_dynamic: true,
            query_sql: `
                SELECT 
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 3. Create active sequence with 0 delay wait nodes and two email steps
        const step1Subject = `Seq Step 1 ${UNIQUE}`;
        const step2Subject = `Seq Step 2 ${UNIQUE}`;
        sequence = await dbInsert("crm_sequences", {
            name: `Sequence ${UNIQUE}`,
            status: "active",
            definition: {
                startNodeId: "node-email-1",
                nodes: [
                    {
                        id: "node-email-1",
                        type: "action_email",
                        data: {
                            subject: step1Subject,
                            html: "<p>Welcome {{name}} to seq step 1!</p>",
                        },
                    },
                    {
                        id: "node-wait-0",
                        type: "wait",
                        data: {
                            delayDays: 0,
                            delayHours: 0,
                            delayMinutes: 0,
                        },
                    },
                    {
                        id: "node-email-2",
                        type: "action_email",
                        data: {
                            subject: step2Subject,
                            html: "<p>Welcome {{name}} to seq step 2!</p>",
                        },
                    },
                ],
                edges: [
                    {
                        id: "edge-1",
                        source: "node-email-1",
                        target: "node-wait-0",
                    },
                    {
                        id: "edge-2",
                        source: "node-wait-0",
                        target: "node-email-2",
                    },
                ],
            },
        });

        // 4. Create campaign linked to follow-up sequence
        const campSubject = `Campaign with Follow-up ${UNIQUE}`;
        campaign = await dbInsert("crm_campaigns", {
            name: `Campaign with Follow-up ${UNIQUE}`,
            channel: "email",
            subject: campSubject,
            content_html: `<p>Hello {{name}}, initial campaign email!</p>`,
            audience_id: audience.id,
            sequence_id: sequence.id,
            status: "draft",
        });

        // 5. Trigger campaign send (this sends campaign email and registers sequence enrollment)
        const sendResult = await triggerCampaignSend(campaign.id);
        expect(sendResult.processed).toBe(1);

        // 6. Verify initial campaign email in Mailpit (recipient, subject, body content)
        await page.waitForTimeout(1000);
        let messages = await getMailpitMessages();
        const campMsg = messages.find((m) => m.Subject === campSubject);
        expect(campMsg).toBeDefined();

        const fullCampMsg = await getFullMailpitMessage(campMsg.ID);
        expect(fullCampMsg.Subject).toBe(campSubject);
        expect(fullCampMsg.To[0].Address).toBe(leadEmail);
        expect(fullCampMsg.HTML).toContain(`Hello Seq Lead ${UNIQUE}`);
        expect(fullCampMsg.HTML).toContain("initial campaign email!");

        // 7. Verify enrollment is active and is at startNodeId ("node-email-1")
        const enrollments = await dbQuery(
            "crm_sequence_enrollments",
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollments.length).toBe(1);
        expect(enrollments[0].current_node_id).toBe("node-email-1");
        expect(enrollments[0].status).toBe("active");

        // 8. Process first sequence step (node-email-1)
        const step1Result = await triggerSequenceProcess();
        expect(step1Result.processed).toBe(1);

        // 9. Verify sequence step 1 email received in Mailpit and verify contents
        await page.waitForTimeout(1000);
        messages = await getMailpitMessages();
        const step1Msg = messages.find((m) => m.Subject === step1Subject);
        expect(step1Msg).toBeDefined();

        const fullStep1Msg = await getFullMailpitMessage(step1Msg.ID);
        expect(fullStep1Msg.Subject).toBe(step1Subject);
        expect(fullStep1Msg.To[0].Address).toBe(leadEmail);
        expect(fullStep1Msg.HTML).toContain(`Welcome Seq Lead ${UNIQUE} to seq step 1!`);

        // 10. Verify enrollment advanced to wait node ("node-wait-0")
        const enrollmentsAfterStep1 = await dbQuery(
            "crm_sequence_enrollments",
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollmentsAfterStep1[0].current_node_id).toBe("node-wait-0");
        expect(enrollmentsAfterStep1[0].status).toBe("active");

        // 11. Process second sequence step (evaluates node-wait-0, advances to node-email-2 with 0 wait time)
        const step2Result = await triggerSequenceProcess();
        expect(step2Result.processed).toBe(1);

        // 12. Verify enrollment advanced to email 2 ("node-email-2")
        const enrollmentsAfterWait = await dbQuery(
            "crm_sequence_enrollments",
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollmentsAfterWait[0].current_node_id).toBe("node-email-2");
        expect(enrollmentsAfterWait[0].status).toBe("active");

        // 13. Process third sequence step (executes node-email-2 and completes enrollment)
        const step3Result = await triggerSequenceProcess();
        expect(step3Result.processed).toBe(1);

        // 14. Verify sequence step 2 email received in Mailpit and verify contents
        await page.waitForTimeout(1000);
        messages = await getMailpitMessages();
        const step2Msg = messages.find((m) => m.Subject === step2Subject);
        expect(step2Msg).toBeDefined();

        const fullStep2Msg = await getFullMailpitMessage(step2Msg.ID);
        expect(fullStep2Msg.Subject).toBe(step2Subject);
        expect(fullStep2Msg.To[0].Address).toBe(leadEmail);
        expect(fullStep2Msg.HTML).toContain(`Welcome Seq Lead ${UNIQUE} to seq step 2!`);

        // 15. Verify enrollment status is now completed
        const enrollmentsCompleted = await dbQuery(
            "crm_sequence_enrollments",
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollmentsCompleted[0].status).toBe("completed");
    });

    test("verifies trigger-based drip (lead.created) automatically enrolls a new lead", async ({ page }) => {
        const leadEmail = `lead.trigger.${UNIQUE.toLowerCase()}@casagrown.local`;
        const stepSubject = `Lead Created Step ${UNIQUE}`;

        // 1. Create active sequence with trigger_event = 'lead.created'
        sequence = await dbInsert("crm_sequences", {
            name: `Lead Created Trigger ${UNIQUE}`,
            status: "active",
            trigger_event: "lead.created",
            definition: {
                startNodeId: "node-email-1",
                nodes: [
                    {
                        id: "node-email-1",
                        type: "action_email",
                        data: {
                            subject: stepSubject,
                            html: "<p>Hello {{name}}, welcome to our event-based lead trigger!</p>",
                        },
                    },
                ],
                edges: [],
            },
        });

        // 2. Insert a lead to trigger pg_net database trigger
        lead = await dbInsert("crm_leads", {
            name: `Trigger Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: "new",
        });

        // 3. Poll database for enrollment (wait up to 5s for asynchronous trigger execution)
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                "crm_sequence_enrollments",
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }

        expect(enrollment).toBeDefined();
        expect(enrollment.current_node_id).toBe("node-email-1");
        expect(enrollment.status).toBe("active");

        // 4. Process sequence steps
        const processResult = await triggerSequenceProcess();
        expect(processResult.processed).toBeGreaterThanOrEqual(1);

        // 5. Verify email in Mailpit and verify contents
        await page.waitForTimeout(1000);
        const messages = await getMailpitMessages();
        const stepMsg = messages.find((m) => m.Subject === stepSubject);
        expect(stepMsg).toBeDefined();

        const fullStepMsg = await getFullMailpitMessage(stepMsg.ID);
        expect(fullStepMsg.Subject).toBe(stepSubject);
        expect(fullStepMsg.To[0].Address).toBe(leadEmail);
        expect(fullStepMsg.HTML).toContain(`Hello Trigger Lead ${UNIQUE}`);
        expect(fullStepMsg.HTML).toContain("welcome to our event-based lead trigger!");
    });

    test("verifies trigger-based drip (user.first_login) automatically enrolls user", async ({ page }) => {
        const stepSubject = `First Login Step ${UNIQUE}`;

        // 1. Create active sequence with trigger_event = 'user.first_login'
        sequence = await dbInsert("crm_sequences", {
            name: `First Login Trigger ${UNIQUE}`,
            status: "active",
            trigger_event: "user.first_login",
            definition: {
                startNodeId: "node-email-1",
                nodes: [
                    {
                        id: "node-email-1",
                        type: "action_email",
                        data: {
                            subject: stepSubject,
                            html: "<p>Hello {{name}}, congrats on completing your profile setup!</p>",
                        },
                    },
                ],
                edges: [],
            },
        });

        // 2. Query a seeded profile
        const profiles = await dbQuery("profiles", "limit=1");
        expect(profiles.length).toBeGreaterThan(0);
        targetProfile = profiles[0];
        originalCompletedAt = targetProfile.profile_completed_at;

        // 3. Trigger transition by setting to NULL then timestamp
        await dbUpdate("profiles", `id=eq.${targetProfile.id}`, {
            profile_completed_at: null,
        });
        await page.waitForTimeout(500);

        await dbUpdate("profiles", `id=eq.${targetProfile.id}`, {
            profile_completed_at: new Date().toISOString(),
        });

        // 4. Poll database for enrollment (Wait up to 5s for trigger worker)
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                "crm_sequence_enrollments",
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${targetProfile.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }

        expect(enrollment).toBeDefined();
        expect(enrollment.current_node_id).toBe("node-email-1");
        expect(enrollment.status).toBe("active");

        // 5. Process sequence step
        const processResult = await triggerSequenceProcess();
        expect(processResult.processed).toBeGreaterThanOrEqual(1);

        // 6. Verify email received in Mailpit and verify contents
        await page.waitForTimeout(1000);
        const messages = await getMailpitMessages();
        const stepMsg = messages.find((m) => m.Subject === stepSubject);
        expect(stepMsg).toBeDefined();

        const fullStepMsg = await getFullMailpitMessage(stepMsg.ID);
        expect(fullStepMsg.Subject).toBe(stepSubject);
        expect(fullStepMsg.To[0].Address).toBe(targetProfile.email);
        expect(fullStepMsg.HTML).toContain(`Hello ${targetProfile.full_name || ""}`);
        expect(fullStepMsg.HTML).toContain("congrats on completing your profile setup!");
    });

    test("verifies trigger-based drip (market_orders.purchase_completed & sale_completed) automatically enrolls buyer and seller", async ({ page }) => {
        const buyerStepSubject = `Buyer Purchase Completed ${UNIQUE}`;
        const sellerStepSubject = `Seller Sale Completed ${UNIQUE}`;

        // 1. Create sequence for buyer (purchase_completed)
        sequence = await dbInsert("crm_sequences", {
            name: `Purchase Completed Trigger ${UNIQUE}`,
            status: "active",
            trigger_event: "market_orders.purchase_completed",
            definition: {
                startNodeId: "node-email-buyer",
                nodes: [
                    {
                        id: "node-email-buyer",
                        type: "action_email",
                        data: {
                            subject: buyerStepSubject,
                            html: "<p>Thank you {{name}} for purchasing on CasaGrown!</p>",
                        },
                    },
                ],
                edges: [],
            },
        });

        // 2. Create sequence for seller (sale_completed)
        sequence2 = await dbInsert("crm_sequences", {
            name: `Sale Completed Trigger ${UNIQUE}`,
            status: "active",
            trigger_event: "market_orders.sale_completed",
            definition: {
                startNodeId: "node-email-seller",
                nodes: [
                    {
                        id: "node-email-seller",
                        type: "action_email",
                        data: {
                            subject: sellerStepSubject,
                            html: "<p>Hello {{name}}, you sold an item on CasaGrown!</p>",
                        },
                    },
                ],
                edges: [],
            },
        });

        // 3. Query seeded dependencies: products, booths, profiles
        const products = await dbQuery("market_products", "limit=1");
        const booths = await dbQuery("market_booths", "limit=1");
        const profiles = await dbQuery("profiles", "limit=2");
        expect(products.length).toBe(1);
        expect(booths.length).toBe(1);
        expect(profiles.length).toBeGreaterThanOrEqual(2);

        const buyer = profiles[0];
        const seller = profiles[1];

        // 4. Create an order with status 'pending' (exclude non-column Booths/Boots keys)
        order = await dbInsert("market_orders", {
            buyer_id: buyer.id,
            seller_id: seller.id,
            booth_id: booths[0].id,
            product_id: products[0].id,
            product_name: products[0].name || "Test Produce",
            quantity: 1,
            unit_price_usd: 10.0,
            subtotal_usd: 10.0,
            tax_rate_pct: 0,
            tax_amount_usd: 0,
            platform_fee_pct: 10,
            platform_fee_usd: 1.0,
            total_usd: 11.0,
            fulfillment_type: "delivery",
            status: "pending",
        });

        // 5. Update order status to 'completed'
        await dbUpdate("market_orders", `id=eq.${order.id}`, {
            status: "completed",
        });

        // 6. Poll database for buyer and seller enrollments (up to 5s)
        let buyerEnrollment = null;
        let sellerEnrollment = null;

        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const buyerEnrList = await dbQuery(
                "crm_sequence_enrollments",
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${buyer.id}`
            );
            const sellerEnrList = await dbQuery(
                "crm_sequence_enrollments",
                `sequence_id=eq.${sequence2.id}&recipient_id=eq.${seller.id}`
            );

            if (buyerEnrList.length > 0) buyerEnrollment = buyerEnrList[0];
            if (sellerEnrList.length > 0) sellerEnrollment = sellerEnrList[0];

            if (buyerEnrollment && sellerEnrollment) break;
        }

        expect(buyerEnrollment).toBeDefined();
        expect(sellerEnrollment).toBeDefined();
        expect(buyerEnrollment.current_node_id).toBe("node-email-buyer");
        expect(sellerEnrollment.current_node_id).toBe("node-email-seller");

        // 7. Process sequence steps
        const processResult = await triggerSequenceProcess();
        expect(processResult.processed).toBeGreaterThanOrEqual(2);

        // 8. Verify emails in Mailpit and verify contents
        await page.waitForTimeout(1000);
        const messages = await getMailpitMessages();
        const buyerMsg = messages.find((m) => m.Subject === buyerStepSubject);
        const sellerMsg = messages.find((m) => m.Subject === sellerStepSubject);
        expect(buyerMsg).toBeDefined();
        expect(sellerMsg).toBeDefined();

        const fullBuyerMsg = await getFullMailpitMessage(buyerMsg.ID);
        expect(fullBuyerMsg.To[0].Address).toBe(buyer.email);
        expect(fullBuyerMsg.HTML).toContain(`Thank you ${buyer.full_name || ""} for purchasing on CasaGrown!`);

        const fullSellerMsg = await getFullMailpitMessage(sellerMsg.ID);
        expect(fullSellerMsg.To[0].Address).toBe(seller.email);
        expect(fullSellerMsg.HTML).toContain(`Hello ${seller.full_name || ""}, you sold an item on CasaGrown!`);
    });

    test("verifies cron-based AI condition trigger (process_ai_condition_enrollments) evaluates dynamic condition and enrolls leads", async ({ page }) => {
        const leadEmail = `lead.ai.cron.${UNIQUE.toLowerCase()}@casagrown.local`;
        const stepSubject = `AI Condition Step ${UNIQUE}`;

        // 1. Create a lead targeting the condition
        lead = await dbInsert("crm_leads", {
            name: `AI Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: "new",
        });

        // 2. Create active sequence with trigger_event = 'ai_condition' and conditionSql
        sequence = await dbInsert("crm_sequences", {
            name: `AI Condition Trigger ${UNIQUE}`,
            status: "active",
            trigger_event: "ai_condition",
            definition: {
                startNodeId: "node-email-1",
                nodes: [
                    {
                        id: "node-email-1",
                        type: "action_email",
                        data: {
                            subject: stepSubject,
                            html: "<p>Hello {{name}}, you matched our dynamic segment condition!</p>",
                            conditionSql: `
                                SELECT 
                                  l.id AS id,
                                  'lead' AS recipient_type,
                                  l.email AS email,
                                  l.phone AS phone,
                                  l.name AS name,
                                  NULL AS state_code,
                                  NULL AS city,
                                  NULL AS zip_code,
                                  NULL AS community_h3,
                                  l.created_at AS joined_at,
                                  l.accepts_email AS accepts_email,
                                  l.accepts_sms AS accepts_sms
                                FROM crm_leads l
                                WHERE l.email = '${leadEmail}'
                            `,
                        },
                    },
                ],
                edges: [],
            },
        });

        // 3. Invoke the AI condition cron logic directly via RPC
        await triggerAiConditionEnrollments();

        // 4. Poll database for enrollment (wait up to 5s for pg_net asynchronous call)
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                "crm_sequence_enrollments",
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }

        expect(enrollment).toBeDefined();
        expect(enrollment.current_node_id).toBe("node-email-1");
        expect(enrollment.status).toBe("active");

        // 5. Process sequence step
        const processResult = await triggerSequenceProcess();
        expect(processResult.processed).toBeGreaterThanOrEqual(1);

        // 6. Verify email received in Mailpit and verify contents
        await page.waitForTimeout(1000);
        const messages = await getMailpitMessages();
        const stepMsg = messages.find((m) => m.Subject === stepSubject);
        expect(stepMsg).toBeDefined();

        const fullStepMsg = await getFullMailpitMessage(stepMsg.ID);
        expect(fullStepMsg.Subject).toBe(stepSubject);
        expect(fullStepMsg.To[0].Address).toBe(leadEmail);
        expect(fullStepMsg.HTML).toContain(`Hello AI Lead ${UNIQUE}`);
        expect(fullStepMsg.HTML).toContain("you matched our dynamic segment condition!");
    });

    // ─── Test A: SMS Campaign Send ─────────────────────────────────────────────────
    test('verifies SMS campaign creates send records in crm_campaign_sends', async ({ page }) => {
        const leadEmail = `lead.sms.${UNIQUE.toLowerCase()}@casagrown.local`;
        const leadPhone = '+15551234567';

        // 1. Create lead with accepts_sms: true
        lead = await dbInsert('crm_leads', {
            name: `SMS Lead ${UNIQUE}`,
            email: leadEmail,
            phone: leadPhone,
            accepts_email: false,
            accepts_sms: true,
            status: 'new',
        });

        // 2. Create dynamic audience targeting this lead
        audience = await dbInsert('crm_audiences', {
            name: `SMS Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 3. Create SMS campaign
        campaign = await dbInsert('crm_campaigns', {
            name: `SMS Campaign ${UNIQUE}`,
            channel: 'sms',
            content_text: 'Hello {{name}}, check out our deals!',
            audience_id: audience.id,
            status: 'draft',
        });

        // 4. Trigger campaign send
        const sendResult = await triggerCampaignSend(campaign.id);
        expect(sendResult.processed).toBe(1);

        // 5. Wait for processing
        await page.waitForTimeout(2000);

        // 6. Query crm_campaign_sends for this campaign_id
        const sends = await dbQuery('crm_campaign_sends', `campaign_id=eq.${campaign.id}`);
        expect(sends.length).toBe(1);

        // 7. Assert: phone matches, recipient_id matches
        expect(sends[0].phone).toBe(leadPhone);
        expect(sends[0].recipient_id).toBe(lead.id);

        // 8. Assert: error contains 'Marketing SMS not configured' (Twilio not configured locally)
        expect(sends[0].error).toContain('Marketing SMS not configured');

        // 9. Query campaign row - assert status === 'sent', sent_at is not null, stats.failed === 1
        const campaigns = await dbQuery('crm_campaigns', `id=eq.${campaign.id}`);
        expect(campaigns[0].status).toBe('sent');
        expect(campaigns[0].sent_at).not.toBeNull();
        expect(campaigns[0].stats.failed).toBe(1);
    });

    // ─── Test B: Campaign Status Lifecycle ────────────────────────────────────────
    test('verifies campaign status transitions from draft to sent with correct stats', async ({ page }) => {
        const leadEmail = `lead.lifecycle.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create lead, audience, and email campaign (status: 'draft')
        lead = await dbInsert('crm_leads', {
            name: `Lifecycle Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        audience = await dbInsert('crm_audiences', {
            name: `Lifecycle Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        const subject = `Lifecycle Subject ${UNIQUE}`;
        campaign = await dbInsert('crm_campaigns', {
            name: `Lifecycle Campaign ${UNIQUE}`,
            channel: 'email',
            subject,
            content_html: `<p>Hello {{name}}, lifecycle test!</p>`,
            audience_id: audience.id,
            status: 'draft',
        });

        // 2. Query campaign before send - assert status === 'draft', sent_at is null
        const before = await dbQuery('crm_campaigns', `id=eq.${campaign.id}`);
        expect(before[0].status).toBe('draft');
        expect(before[0].sent_at).toBeNull();

        // 3. Trigger campaign send
        await triggerCampaignSend(campaign.id);

        // 4. Query campaign after send
        await page.waitForTimeout(2000);
        const after = await dbQuery('crm_campaigns', `id=eq.${campaign.id}`);
        expect(after[0].status).toBe('sent');
        expect(after[0].sent_at).not.toBeNull();
        // Verify sent_at is a valid ISO timestamp
        expect(new Date(after[0].sent_at).getTime()).not.toBeNaN();
        expect(after[0].stats.total_sent).toBe(1);
        expect(after[0].stats.opened).toBe(0);
        expect(after[0].stats.clicked).toBe(0);
        expect(after[0].stats.bounced).toBe(0);

        // 5. Verify email in Mailpit
        const messages = await getMailpitMessages();
        const msg = messages.find((m) => m.Subject === subject);
        expect(msg).toBeDefined();
    });

    // ─── Test C: crm_campaign_sends Audit Trail for Email Campaigns ────────────────
    test('verifies crm_campaign_sends audit records are created for email campaigns', async ({ page }) => {
        const leadEmail = `lead.audit.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create lead, audience, email campaign
        lead = await dbInsert('crm_leads', {
            name: `Audit Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        audience = await dbInsert('crm_audiences', {
            name: `Audit Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        campaign = await dbInsert('crm_campaigns', {
            name: `Audit Campaign ${UNIQUE}`,
            channel: 'email',
            subject: `Audit Subject ${UNIQUE}`,
            content_html: `<p>Hello {{name}}, audit trail test!</p>`,
            audience_id: audience.id,
            status: 'draft',
        });

        // 2. Trigger campaign send
        await triggerCampaignSend(campaign.id);
        await page.waitForTimeout(2000);

        // 3. Query crm_campaign_sends where campaign_id = this campaign
        const sends = await dbQuery('crm_campaign_sends', `campaign_id=eq.${campaign.id}`);

        // 4. Assert: exactly 1 record
        expect(sends.length).toBe(1);

        // 5. Assert: recipient_id === lead.id
        expect(sends[0].recipient_id).toBe(lead.id);

        // 6. Assert: email === lead's email
        expect(sends[0].email).toBe(leadEmail);

        // 7. Assert: sent_at is NOT null
        expect(sends[0].sent_at).not.toBeNull();

        // 8. Assert: error is null (success)
        expect(sends[0].error).toBeNull();

        // 9. Assert: recipient_type === 'lead'
        expect(sends[0].recipient_type).toBe('lead');
    });

    // ─── Test D: crm_campaign_sends Audit Trail for Sequence Steps ──────────────────
    test('verifies crm_campaign_sends audit records are created for sequence email steps', async ({ page }) => {
        const leadEmail = `lead.seqaudit.${UNIQUE.toLowerCase()}@casagrown.local`;
        const stepSubject = `Seq Audit Step ${UNIQUE}`;

        // 1. Create sequence with trigger_event: 'lead.created', one action_email node
        sequence = await dbInsert('crm_sequences', {
            name: `Seq Audit Trigger ${UNIQUE}`,
            status: 'active',
            trigger_event: 'lead.created',
            definition: {
                startNodeId: 'node-email-1',
                nodes: [
                    {
                        id: 'node-email-1',
                        type: 'action_email',
                        data: {
                            subject: stepSubject,
                            html: '<p>Hello {{name}}, sequence audit test!</p>',
                        },
                    },
                ],
                edges: [],
            },
        });

        // 2. Insert lead (triggers enrollment via lead.created)
        lead = await dbInsert('crm_leads', {
            name: `SeqAudit Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        // 3. Poll for enrollment
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                'crm_sequence_enrollments',
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }
        expect(enrollment).toBeDefined();

        // 4. Process sequence step
        await triggerSequenceProcess();
        await page.waitForTimeout(2000);

        // 5. Query crm_campaign_sends where sequence_id = this sequence
        const sends = await dbQuery('crm_campaign_sends', `sequence_id=eq.${sequence.id}`);

        // 6. Assert: exactly 1 record
        expect(sends.length).toBe(1);

        // 7. Assert: campaign_id IS null
        expect(sends[0].campaign_id).toBeNull();

        // 8. Assert: sequence_id matches
        expect(sends[0].sequence_id).toBe(sequence.id);

        // 9. Assert: node_id === 'node-email-1'
        expect(sends[0].node_id).toBe('node-email-1');

        // 10. Assert: recipient_id === lead.id
        expect(sends[0].recipient_id).toBe(lead.id);

        // 11. Assert: sent_at is NOT null, error is null
        expect(sends[0].sent_at).not.toBeNull();
        expect(sends[0].error).toBeNull();
    });

    // ─── Test E: Consent Opt-Out Filtering (Email) ─────────────────────────────────
    test('verifies consent opt-out filtering skips leads with accepts_email false', async ({ page }) => {
        const leadEmail = `lead.optout.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create lead with accepts_email: FALSE
        lead = await dbInsert('crm_leads', {
            name: `OptOut Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: false,
            accepts_sms: false,
            status: 'new',
        });

        // 2. Create dynamic audience targeting this lead by email
        audience = await dbInsert('crm_audiences', {
            name: `OptOut Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 3. Create email campaign
        campaign = await dbInsert('crm_campaigns', {
            name: `OptOut Campaign ${UNIQUE}`,
            channel: 'email',
            subject: `OptOut Subject ${UNIQUE}`,
            content_html: `<p>Hello {{name}}, this should not arrive!</p>`,
            audience_id: audience.id,
            status: 'draft',
        });

        // 4. Trigger campaign send
        const sendResult = await triggerCampaignSend(campaign.id);
        expect(sendResult.processed).toBe(1);

        // 5. Wait, then check Mailpit - should have NO messages
        await page.waitForTimeout(3000);
        const messages = await getMailpitMessages();
        const optOutMsg = messages.find(
            (m) => m.Subject === `OptOut Subject ${UNIQUE}`
        );
        expect(optOutMsg).toBeUndefined();

        // 6. Verify crm_campaign_sends has NO records for this campaign
        const sends = await dbQuery('crm_campaign_sends', `campaign_id=eq.${campaign.id}`);
        expect(sends.length).toBe(0);
    });

    // ─── Test F: Condition Node Branching (True Path) ─────────────────────────────
    test('verifies condition node routes to true branch when condition matches', async ({ page }) => {
        const leadEmail = `lead.condtrue.${UNIQUE.toLowerCase()}@casagrown.local`;
        const trueSubject = `Condition True ${UNIQUE}`;
        const falseSubject = `Condition False ${UNIQUE}`;

        // 1. Create sequence with condition node checking status === 'new'
        sequence = await dbInsert('crm_sequences', {
            name: `Condition True Trigger ${UNIQUE}`,
            status: 'active',
            trigger_event: 'lead.created',
            definition: {
                startNodeId: 'node-condition',
                nodes: [
                    {
                        id: 'node-condition',
                        type: 'condition',
                        data: {
                            query: {
                                combinator: 'and',
                                rules: [
                                    { field: 'status', operator: '=', value: 'new' },
                                ],
                            },
                        },
                    },
                    {
                        id: 'node-email-true',
                        type: 'action_email',
                        data: {
                            subject: trueSubject,
                            html: '<p>You matched the condition, {{name}}!</p>',
                        },
                    },
                    {
                        id: 'node-email-false',
                        type: 'action_email',
                        data: {
                            subject: falseSubject,
                            html: '<p>You did not match, {{name}}.</p>',
                        },
                    },
                ],
                edges: [
                    { id: 'edge-true', source: 'node-condition', target: 'node-email-true', label: 'true' },
                    { id: 'edge-false', source: 'node-condition', target: 'node-email-false', label: 'false' },
                ],
            },
        });

        // 2. Insert lead with status: 'new' (triggers enrollment)
        lead = await dbInsert('crm_leads', {
            name: `CondTrue Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        // 3. Poll for enrollment - should be at 'node-condition'
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                'crm_sequence_enrollments',
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }
        expect(enrollment).toBeDefined();
        expect(enrollment.current_node_id).toBe('node-condition');

        // 4. Process sequence step (evaluates condition)
        await triggerSequenceProcess();
        await page.waitForTimeout(1000);

        // 5. Check enrollment - should have advanced to 'node-email-true'
        const afterCondition = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(afterCondition[0].current_node_id).toBe('node-email-true');

        // 6. Process sequence step again (sends email)
        await triggerSequenceProcess();
        await page.waitForTimeout(1000);

        // 7. Verify Mailpit has email with 'Condition True' subject
        const messages = await getMailpitMessages();
        const trueMsg = messages.find((m) => m.Subject === trueSubject);
        expect(trueMsg).toBeDefined();

        // 8. Verify Mailpit does NOT have 'Condition False' email
        const falseMsg = messages.find((m) => m.Subject === falseSubject);
        expect(falseMsg).toBeUndefined();
    });

    // ─── Test G: Condition Node Branching (False Path) ────────────────────────────
    test('verifies condition node routes to false branch when condition does not match', async ({ page }) => {
        const leadEmail = `lead.condfalse.${UNIQUE.toLowerCase()}@casagrown.local`;
        const trueSubject = `CondFalse True ${UNIQUE}`;
        const falseSubject = `CondFalse False ${UNIQUE}`;

        // 1. Create sequence with condition node checking status === 'new'
        sequence = await dbInsert('crm_sequences', {
            name: `Condition False Trigger ${UNIQUE}`,
            status: 'active',
            trigger_event: 'lead.created',
            definition: {
                startNodeId: 'node-condition',
                nodes: [
                    {
                        id: 'node-condition',
                        type: 'condition',
                        data: {
                            query: {
                                combinator: 'and',
                                rules: [
                                    { field: 'status', operator: '=', value: 'new' },
                                ],
                            },
                        },
                    },
                    {
                        id: 'node-email-true',
                        type: 'action_email',
                        data: {
                            subject: trueSubject,
                            html: '<p>You matched, {{name}}!</p>',
                        },
                    },
                    {
                        id: 'node-email-false',
                        type: 'action_email',
                        data: {
                            subject: falseSubject,
                            html: '<p>You did not match, {{name}}.</p>',
                        },
                    },
                ],
                edges: [
                    { id: 'edge-true', source: 'node-condition', target: 'node-email-true', label: 'true' },
                    { id: 'edge-false', source: 'node-condition', target: 'node-email-false', label: 'false' },
                ],
            },
        });

        // 2. Insert lead with status: 'contacted' (NOT 'new', so condition is false)
        lead = await dbInsert('crm_leads', {
            name: `CondFalse Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'contacted',
        });

        // 3. Poll for enrollment
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                'crm_sequence_enrollments',
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }
        expect(enrollment).toBeDefined();

        // 4. Process sequence step (evaluates condition - false since status is 'contacted')
        await triggerSequenceProcess();
        await page.waitForTimeout(1000);

        // 5. Check enrollment - should have advanced to 'node-email-false'
        const afterCondition = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(afterCondition[0].current_node_id).toBe('node-email-false');

        // 6. Process sequence step (sends email)
        await triggerSequenceProcess();
        await page.waitForTimeout(1000);

        // 7. Verify Mailpit has 'Condition False' email
        const messages = await getMailpitMessages();
        const falseMsg = messages.find((m) => m.Subject === falseSubject);
        expect(falseMsg).toBeDefined();

        // 8. Verify Mailpit does NOT have 'Condition True' email
        const trueMsg = messages.find((m) => m.Subject === trueSubject);
        expect(trueMsg).toBeUndefined();
    });

    // ─── Test H: Non-Zero Wait Node Timing ────────────────────────────────────────
    test('verifies non-zero wait node sets future next_evaluation_at and does not advance prematurely', async ({ page }) => {
        const leadEmail = `lead.wait.${UNIQUE.toLowerCase()}@casagrown.local`;
        const email1Subject = `Wait Email 1 ${UNIQUE}`;
        const email2Subject = `Wait Email 2 ${UNIQUE}`;

        // 1. Create lead
        lead = await dbInsert('crm_leads', {
            name: `Wait Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        // 2. Create audience
        audience = await dbInsert('crm_audiences', {
            name: `Wait Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 3. Create sequence: email-1 → wait(1 day) → email-2
        sequence = await dbInsert('crm_sequences', {
            name: `Wait Sequence ${UNIQUE}`,
            status: 'active',
            definition: {
                startNodeId: 'node-email-1',
                nodes: [
                    {
                        id: 'node-email-1',
                        type: 'action_email',
                        data: {
                            subject: email1Subject,
                            html: '<p>Hello {{name}}, wait test email 1!</p>',
                        },
                    },
                    {
                        id: 'node-wait-1day',
                        type: 'wait',
                        data: {
                            delayDays: 1,
                            delayHours: 0,
                            delayMinutes: 0,
                        },
                    },
                    {
                        id: 'node-email-2',
                        type: 'action_email',
                        data: {
                            subject: email2Subject,
                            html: '<p>Hello {{name}}, wait test email 2!</p>',
                        },
                    },
                ],
                edges: [
                    { id: 'edge-1', source: 'node-email-1', target: 'node-wait-1day' },
                    { id: 'edge-2', source: 'node-wait-1day', target: 'node-email-2' },
                ],
            },
        });

        // 4. Create campaign with sequence_id, trigger send
        campaign = await dbInsert('crm_campaigns', {
            name: `Wait Campaign ${UNIQUE}`,
            channel: 'email',
            subject: `Wait Campaign Subject ${UNIQUE}`,
            content_html: `<p>Hello {{name}}, campaign blast before wait!</p>`,
            audience_id: audience.id,
            sequence_id: sequence.id,
            status: 'draft',
        });

        await triggerCampaignSend(campaign.id);
        await page.waitForTimeout(1000);

        // 5. Process step 1 (sends email-1, advances to wait node)
        await triggerSequenceProcess();
        await page.waitForTimeout(1000);

        // 6. Verify enrollment is now at wait node with next_evaluation_at = now
        let enrollments = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollments[0].current_node_id).toBe('node-wait-1day');
        expect(enrollments[0].status).toBe('active');

        // 7. Process wait node — the engine advances current_node_id to 'node-email-2'
        //    but sets next_evaluation_at ~1 day in the future
        await triggerSequenceProcess();
        await page.waitForTimeout(500);

        // 8. Verify enrollment moved to email-2 but with a FUTURE next_evaluation_at
        enrollments = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollments[0].current_node_id).toBe('node-email-2');
        expect(enrollments[0].status).toBe('active');
        // Verify next_evaluation_at is in the future (~1 day from now)
        const futureEvalAt = new Date(enrollments[0].next_evaluation_at).getTime();
        const now = Date.now();
        expect(futureEvalAt).toBeGreaterThan(now + 12 * 60 * 60 * 1000); // at least 12h in the future

        // 9. Process again — should NOT execute email-2 because next_evaluation_at is in the future
        await triggerSequenceProcess();
        await page.waitForTimeout(500);

        // 10. Verify enrollment is STILL at email-2, still active (not completed)
        enrollments = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollments[0].current_node_id).toBe('node-email-2');
        expect(enrollments[0].status).toBe('active');

        // 11. Manually backdate next_evaluation_at to simulate the 1-day wait elapsing
        await dbUpdate(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`,
            { next_evaluation_at: new Date(Date.now() - 60000).toISOString() }
        );

        // 12. Process again — NOW email-2 should send and enrollment completes
        await triggerSequenceProcess();
        await page.waitForTimeout(1000);

        // 13. Verify enrollment status is 'completed'
        enrollments = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(enrollments[0].status).toBe('completed');

        // 14. Verify email-2 arrived in Mailpit
        const messages = await getMailpitMessages();
        const email2Msg = messages.find((m) => m.Subject === email2Subject);
        expect(email2Msg).toBeDefined();
    });

    // ─── Test I: Scheduled Campaign (Cron Mode) ──────────────────────────────────
    test('verifies scheduled campaign is picked up when scheduled_at is in the past', async ({ page }) => {
        const leadEmail = `lead.sched.${UNIQUE.toLowerCase()}@casagrown.local`;
        const subject = `Scheduled Campaign ${UNIQUE}`;

        // 1. Create lead, audience
        lead = await dbInsert('crm_leads', {
            name: `Sched Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        audience = await dbInsert('crm_audiences', {
            name: `Sched Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 2. Create campaign with status: 'scheduled', scheduled_at in the past
        campaign = await dbInsert('crm_campaigns', {
            name: `Sched Campaign ${UNIQUE}`,
            channel: 'email',
            subject,
            content_html: `<p>Hello {{name}}, scheduled campaign test!</p>`,
            audience_id: audience.id,
            status: 'scheduled',
            scheduled_at: new Date(Date.now() - 60000).toISOString(),
        });

        // 3. Call triggerCampaignCron (empty body = cron mode)
        await triggerCampaignCron();

        // 4. Wait, verify email arrived in Mailpit
        await page.waitForTimeout(3000);
        const messages = await getMailpitMessages();
        const msg = messages.find((m) => m.Subject === subject);
        expect(msg).toBeDefined();

        // 5. Query campaign - assert status === 'sent'
        const campaigns = await dbQuery('crm_campaigns', `id=eq.${campaign.id}`);
        expect(campaigns[0].status).toBe('sent');
        expect(campaigns[0].sent_at).not.toBeNull();
    });

    // ─── Test J: Duplicate Enrollment Prevention ──────────────────────────────────
    test('verifies duplicate enrollment is prevented for same lead in same sequence', async ({ page }) => {
        const leadEmail = `lead.dedup.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create sequence with trigger_event: 'lead.created', one email node
        sequence = await dbInsert('crm_sequences', {
            name: `Dedup Trigger ${UNIQUE}`,
            status: 'active',
            trigger_event: 'lead.created',
            definition: {
                startNodeId: 'node-email-1',
                nodes: [
                    {
                        id: 'node-email-1',
                        type: 'action_email',
                        data: {
                            subject: `Dedup Step ${UNIQUE}`,
                            html: '<p>Hello {{name}}, dedup test!</p>',
                        },
                    },
                ],
                edges: [],
            },
        });

        // 2. Insert lead (auto-enrolls via trigger)
        lead = await dbInsert('crm_leads', {
            name: `Dedup Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        // 3. Poll for enrollment - should exist
        let enrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                'crm_sequence_enrollments',
                `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                enrollment = enrollments[0];
                break;
            }
        }
        expect(enrollment).toBeDefined();

        // 4. Try to manually enroll the same lead via the enroll-in-sequence edge function
        let duplicateError = false;
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/enroll-in-sequence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                    sequence_id: sequence.id,
                    recipients: [{ recipient_type: 'lead', recipient_id: lead.id }],
                }),
            });
            if (!res.ok) {
                duplicateError = true;
            }
        } catch (_e) {
            duplicateError = true;
        }

        // 5. Assert that only 1 enrollment exists in DB (regardless of whether error was thrown)
        const allEnrollments = await dbQuery(
            'crm_sequence_enrollments',
            `sequence_id=eq.${sequence.id}&recipient_id=eq.${lead.id}`
        );
        expect(allEnrollments.length).toBe(1);
    });

    // ─── Test K: Campaign + Trigger Cross-Dependency ──────────────────────────────
    test('verifies campaign blast and event trigger drip can independently enroll the same user', async ({ page }) => {
        const leadEmail = `lead.crossdep.${UNIQUE.toLowerCase()}@casagrown.local`;
        const triggerSubject = `CrossDep Trigger ${UNIQUE}`;
        const followUpSubject = `CrossDep FollowUp ${UNIQUE}`;
        const campaignSubject = `CrossDep Campaign ${UNIQUE}`;

        // 1. Create sequence2 (trigger_event: 'lead.created') FIRST
        sequence2 = await dbInsert('crm_sequences', {
            name: `CrossDep Trigger Seq ${UNIQUE}`,
            status: 'active',
            trigger_event: 'lead.created',
            definition: {
                startNodeId: 'node-email-trigger',
                nodes: [
                    {
                        id: 'node-email-trigger',
                        type: 'action_email',
                        data: {
                            subject: triggerSubject,
                            html: '<p>Hello {{name}}, trigger-based drip!</p>',
                        },
                    },
                ],
                edges: [],
            },
        });

        // 2. Create lead (this auto-enrolls in sequence2 via trigger)
        lead = await dbInsert('crm_leads', {
            name: `CrossDep Lead ${UNIQUE}`,
            email: leadEmail,
            phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
            accepts_email: true,
            accepts_sms: false,
            status: 'new',
        });

        // 3. Poll for sequence2 enrollment
        let triggerEnrollment = null;
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            const enrollments = await dbQuery(
                'crm_sequence_enrollments',
                `sequence_id=eq.${sequence2.id}&recipient_id=eq.${lead.id}`
            );
            if (enrollments.length > 0) {
                triggerEnrollment = enrollments[0];
                break;
            }
        }
        expect(triggerEnrollment).toBeDefined();

        // 4. Create audience targeting this lead
        audience = await dbInsert('crm_audiences', {
            name: `CrossDep Audience ${UNIQUE}`,
            recipient_type: 'leads',
            is_dynamic: true,
            query_sql: `
                SELECT
                  l.id AS id,
                  'lead' AS recipient_type,
                  l.email AS email,
                  l.phone AS phone,
                  l.name AS name,
                  NULL AS state_code,
                  NULL AS city,
                  NULL AS zip_code,
                  NULL AS community_h3,
                  l.created_at AS joined_at,
                  l.accepts_email AS accepts_email,
                  l.accepts_sms AS accepts_sms
                FROM crm_leads l
                WHERE l.email = '${leadEmail}'
            `,
        });

        // 5. Create sequence (manual follow-up drip)
        sequence = await dbInsert('crm_sequences', {
            name: `CrossDep FollowUp Seq ${UNIQUE}`,
            status: 'active',
            definition: {
                startNodeId: 'node-email-followup',
                nodes: [
                    {
                        id: 'node-email-followup',
                        type: 'action_email',
                        data: {
                            subject: followUpSubject,
                            html: '<p>Hello {{name}}, follow-up drip email!</p>',
                        },
                    },
                ],
                edges: [],
            },
        });

        // 6. Create campaign linked to audience + sequence (follow-up)
        campaign = await dbInsert('crm_campaigns', {
            name: `CrossDep Campaign ${UNIQUE}`,
            channel: 'email',
            subject: campaignSubject,
            content_html: `<p>Hello {{name}}, campaign blast!</p>`,
            audience_id: audience.id,
            sequence_id: sequence.id,
            status: 'draft',
        });

        // 7. Trigger campaign send (sends blast + enrolls in sequence)
        const sendResult = await triggerCampaignSend(campaign.id);
        expect(sendResult.processed).toBe(1);
        await page.waitForTimeout(1000);

        // 8. Query crm_sequence_enrollments for lead - assert 2 enrollments
        const allEnrollments = await dbQuery(
            'crm_sequence_enrollments',
            `recipient_id=eq.${lead.id}`
        );
        const enrolledSeqIds = allEnrollments.map((e: any) => e.sequence_id);
        expect(enrolledSeqIds).toContain(sequence.id);
        expect(enrolledSeqIds).toContain(sequence2.id);
        expect(allEnrollments.length).toBe(2);

        // 9. Process sequence steps (should process both)
        const processResult = await triggerSequenceProcess();
        expect(processResult.processed).toBeGreaterThanOrEqual(2);
        await page.waitForTimeout(1000);

        // 10. Verify emails: campaign blast + trigger drip + follow-up drip = 3 total
        const messages = await getMailpitMessages();
        const campaignMsg = messages.find((m) => m.Subject === campaignSubject);
        const triggerMsg = messages.find((m) => m.Subject === triggerSubject);
        const followUpMsg = messages.find((m) => m.Subject === followUpSubject);
        expect(campaignMsg).toBeDefined();
        expect(triggerMsg).toBeDefined();
        expect(followUpMsg).toBeDefined();
    });

    test("verifies RBAC routing and layout boundaries for Marketing-Only vs Full Admin", async ({ page }) => {
        const marketingEmail = `marketing-agent.${UNIQUE.toLowerCase()}@casagrown.local`;

        // 1. Create a user with ONLY the marketing staff role
        marketingUserId = await createMarketingUser(marketingEmail);

        // 2. Sign in as the marketing agent
        await signInAsUser(page, marketingEmail);

        // 3. Navigate to CRM campaigns page — should load successfully and display customized CRM title
        await page.goto("/crm/campaigns");
        await expect(page.locator("text=CasaGrown CRM").first()).toBeVisible({ timeout: 15_000 });
        await expect(page.locator("text=Email / SMS Campaigns").first()).toBeVisible({ timeout: 15_000 });

        // 4. Check sidebar navigation lists only CRM and Account (restricted layout)
        await expect(page.locator("text=CRM & MARKETING").first()).toBeVisible();
        await expect(page.locator("text=ACCOUNT").first()).toBeVisible();
        await expect(page.locator("text=SYSTEM CONTROLS")).not.toBeVisible();
        await expect(page.locator("text=USERS & STAFF")).not.toBeVisible();

        // 5. Attempt accessing restricted core admin routes — should trigger AuthGuard redirect to /unauthorized
        await page.goto("/users");
        await expect(page).toHaveURL(/.*\/unauthorized/);

        await page.goto("/category-restrictions");
        await expect(page).toHaveURL(/.*\/unauthorized/);

        // 6. Sign out, and sign back in as Full Admin (seller@test.local)
        // Sign out by clearing tokens
        await page.evaluate(() => {
            localStorage.clear();
            document.cookie = "sb-127-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        });

        await signInAsUser(page, "seller@test.local");

        // 7. Verify full admin loads standard portal title
        await page.goto("/crm/campaigns");
        await expect(page.locator("text=CasaGrown Admin").first()).toBeVisible({ timeout: 15_000 });

        // 8. Verify full admin successfully accesses core admin pages (no redirect to unauthorized)
        await page.goto("/users");
        await expect(page).not.toHaveURL(/.*\/unauthorized/);
        await expect(page.locator("text=Staff & User Management").first()).toBeVisible({ timeout: 15_000 });
    });
});
