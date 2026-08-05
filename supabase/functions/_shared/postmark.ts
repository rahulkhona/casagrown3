/**
 * Shared helper for sending emails via SMTP.
 *
 * In production: uses Postmark SMTP (smtp.postmarkapp.com:587)
 * In local dev:  uses Mailpit SMTP (localhost:54325) — emails show up
 *                alongside OTP emails at http://localhost:54324
 *
 * Usage:
 *   import { sendTransactionEmail } from "../_shared/postmark.ts";
 *   await sendTransactionEmail({ to, subject, htmlBody });
 *
 * Fire-and-forget — errors are logged but not thrown.
 *
 * Env vars:
 *   POSTMARK_SERVER_TOKEN  — Postmark API token (SMTP username + password)
 *   POSTMARK_FROM_EMAIL    — Sender address (e.g. noreply@casagrown.com)
 *   POSTMARK_MESSAGE_STREAM — Postmark message stream (default: "outbound")
 *
 * When POSTMARK_SERVER_TOKEN is not set, emails route to Mailpit for local dev.
 */

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ═══════════════════════════════════════════════════════════════
// Production Environment Sanity Check (runs once at import time)
// Warnings appear in: Dashboard → Edge Functions → Logs tab
// Or via CLI: npx supabase functions logs <name> --project-ref <ref>
// ═══════════════════════════════════════════════════════════════
{
  const isProduction = !!Deno.env.get("POSTMARK_SERVER_TOKEN");
  if (isProduction) {
    const checks: [string, string | undefined, (v: string) => boolean, string][] = [
      ["SITE_URL", Deno.env.get("SITE_URL"), (v) => v.includes("localhost"), "contains 'localhost' — emails will have broken links!"],
      ["POSTMARK_FROM_EMAIL", Deno.env.get("POSTMARK_FROM_EMAIL"), (v) => v.includes("casasgrown") || v.includes("localhost"), "has typo or localhost domain!"],
      ["STRIPE_SECRET_KEY", Deno.env.get("STRIPE_SECRET_KEY"), (v) => v.startsWith("sk_test_"), "using TEST key in production!"],
      ["GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"), (v) => !v || v.length < 10, "missing or too short!"],
    ];
    for (const [name, value, isBad, msg] of checks) {
      if (value && isBad(value)) {
        console.error(`🚨 [ENV SANITY] ${name} ${msg} Current value prefix: "${value.substring(0, 20)}..."`);
      }
    }
  }
}

interface EmailPayload {
    /** Recipient email address */
    to: string;
    /** Email subject line */
    subject: string;
    /** HTML body content */
    htmlBody: string;
    /** Plain text body content fallback */
    textBody?: string;
    /** Custom JSON string metadata for precise webhook mapping */
    metadata?: Record<string, string>;
}

/**
 * Send an email via SMTP.
 * - With POSTMARK_SERVER_TOKEN: sends via Postmark SMTP
 * - Without token: sends via Mailpit SMTP (localhost:54325)
 *
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function sendTransactionEmail(
    payload: EmailPayload,
): Promise<{ success: boolean; error?: string }> {
    const token = Deno.env.get("POSTMARK_SERVER_TOKEN");
    let fromEmail = Deno.env.get("POSTMARK_FROM_EMAIL") ??
        "no-reply@alerts.casagrown.com";
        
    // Auto-correct typo in staging environment variable
    if (fromEmail.includes("casasgrown.com")) {
        fromEmail = fromEmail.replace("casasgrown.com", "casagrown.com");
    }
    let messageStream = Deno.env.get("POSTMARK_MESSAGE_STREAM") ?? "outbound";
    
    // Safety fallback: if an invalid stream was configured in staging, route to the default transactional stream
    if (messageStream === "casagrown_transactional") {
        messageStream = "outbound";
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const isLocal = supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
    const isProduction = !!token && !isLocal;

    try {
        if (isProduction) {
            // Production: Postmark REST API (Bypasses brittle Edge SMTP/TLS issues)
            const res = await fetch("https://api.postmarkapp.com/email", {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Postmark-Server-Token": token!,
                },
                body: JSON.stringify({
                    From: fromEmail,
                    To: payload.to,
                    Subject: payload.subject,
                    HtmlBody: payload.htmlBody,
                    ...(payload.textBody && { TextBody: payload.textBody }),
                    MessageStream: messageStream,
                    ...(payload.metadata && { Metadata: payload.metadata })
                })
            });

            if (!res.ok) {
                const errStr = await res.text();
                throw new Error(`Postmark REST API error: ${res.status} ${errStr}`);
            }

            console.log(`📧 Email sent via Postmark REST to ${payload.to}: ${payload.subject}`);
            return { success: true };
        }

        // Local dev: Mailpit SMTP (no auth, no TLS)
        const client = new SMTPClient({
            connection: {
                hostname: Deno.env.get("MAILPIT_HOST") ?? "host.docker.internal",
                port: 54325,
                tls: false,
            },
            debug: { allowUnsecure: true },
        });

        const cleanHtml = payload.htmlBody.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

        // deno-lint-ignore no-explicit-any
        const sendOpts: any = {
            from: fromEmail,
            to: payload.to,
            subject: payload.subject,
            content: "auto",
            html: cleanHtml,
            ...(payload.textBody && { text: payload.textBody }),
        };

        await client.send(sendOpts);
        await client.close();

        console.log(`📧 Email sent to Mailpit for ${payload.to}: ${payload.subject} — check http://localhost:54324`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Email send failed for ${payload.to}:`, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Look up a user's email address from auth.users via Supabase admin API.
 */
export async function getUserEmail(
    supabase: {
        auth: {
            admin: {
                getUserById: (
                    id: string,
                ) => Promise<{ data: { user: { email?: string } | null } }>;
            };
        };
    },
    userId: string,
): Promise<string | null> {
    try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        return data?.user?.email ?? null;
    } catch {
        return null;
    }
}

/**
 * Send an email via Postmark's dedicated Broadcast SMTP cluster.
 * Uses smtp-broadcasts.postmarkapp.com to ensure bulk sends are 
 * routed correctly and don't risk your transactional IP reputation.
 */
export async function sendBroadcastEmail(
    payload: EmailPayload,
): Promise<{ success: boolean; error?: string }> {
    const token = Deno.env.get("POSTMARK_BROADCAST_TOKEN");
    const fromEmail = Deno.env.get("POSTMARK_BROADCAST_FROM_EMAIL") ??
        Deno.env.get("POSTMARK_FROM_EMAIL") ?? "no-reply@news.casagrown.com";
    const messageStream = Deno.env.get("POSTMARK_BROADCAST_STREAM") ??
        "broadcast";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const isLocal = supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
    const isProduction = !!token && !isLocal;

    try {
        if (isProduction) {
            // Production: Postmark REST API (same approach as sendBroadcastEmailBatch)
            // SMTP over TLS (port 465) times out from Supabase Edge Functions
            const res = await fetch("https://api.postmarkapp.com/email", {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Postmark-Server-Token": token!,
                },
                body: JSON.stringify({
                    From: fromEmail,
                    To: payload.to,
                    Subject: payload.subject,
                    HtmlBody: payload.htmlBody,
                    ...(payload.textBody && { TextBody: payload.textBody }),
                    MessageStream: messageStream,
                    ...(payload.metadata && { Metadata: payload.metadata }),
                }),
            });

            if (!res.ok) {
                const errStr = await res.text();
                throw new Error(`Postmark REST API error: ${res.status} ${errStr}`);
            }

            console.log(`📡 Broadcast sent via Postmark REST to ${payload.to}: ${payload.subject}`);
            return { success: true };
        }

        // Local dev: Mailpit SMTP (no auth, no TLS)
        const client = new SMTPClient({
            connection: {
                hostname: Deno.env.get("MAILPIT_HOST") ?? "host.docker.internal",
                port: 54325,
                tls: false,
            },
            debug: { allowUnsecure: true },
        });

        const cleanHtml = payload.htmlBody.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

        // deno-lint-ignore no-explicit-any
        const sendOpts: any = {
            from: fromEmail,
            to: payload.to,
            subject: payload.subject,
            content: "auto",
            html: cleanHtml,
            ...(payload.textBody && { text: payload.textBody }),
        };

        await client.send(sendOpts);
        await client.close();

        console.log(`📡 Broadcast sent to Mailpit for ${payload.to}: ${payload.subject}`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Broadcast send failed for ${payload.to}:`, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Send an array of emails via Postmark's /email/batch API.
 * Max 500 emails per batch based on Postmark limits.
 * Falls back to sequential local SMTP processing via Mailpit if no token exists.
 */
export async function sendBroadcastEmailBatch(
    payloads: EmailPayload[],
): Promise<{ success: boolean; error?: string }> {
    if (payloads.length === 0) return { success: true };
    if (payloads.length > 500) {
        return { success: false, error: "Postmark max batch size is 500" };
    }

    const token = Deno.env.get("POSTMARK_BROADCAST_TOKEN");
    const fromEmail = Deno.env.get("POSTMARK_BROADCAST_FROM_EMAIL") ??
        Deno.env.get("POSTMARK_FROM_EMAIL") ?? "no-reply@news.casagrown.com";
    const messageStream = Deno.env.get("POSTMARK_BROADCAST_STREAM") ?? "broadcast";

    if (!token) {
        // Local Dev Fallback: Send sequentially via Mailpit SMTP
        console.log(`📡 Local dev: Batching ${payloads.length} emails to Mailpit...`);
        for (const p of payloads) {
            await sendBroadcastEmail(p);
        }
        return { success: true };
    }

    // Production: Postmark Batch API format
    const messages = payloads.map(p => ({
        From: fromEmail,
        To: p.to,
        Subject: p.subject,
        HtmlBody: p.htmlBody,
        ...(p.textBody && { TextBody: p.textBody }),
        MessageStream: messageStream,
        ...(p.metadata && { Metadata: p.metadata })
    }));

    try {
        const res = await fetch("https://api.postmarkapp.com/email/batch", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": token,
            },
            body: JSON.stringify(messages)
        });

        if (!res.ok) {
            const errStr = await res.text();
            throw new Error(`Postmark batch API error: ${res.status} ${errStr}`);
        }

        console.log(`📡 Batch sent via Postmark API: ${payloads.length} emails`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Batch broadcast send failed:`, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export interface TemplatePayload {
    to: string;
    templateAlias: string;
    templateModel: Record<string, unknown>;
    metadata?: Record<string, string>;
}

/**
 * Send an array of emails via Postmark's /email/batchWithTemplates API.
 * Max 500 emails per batch.
 */
export async function sendBroadcastTemplateBatch(
    payloads: TemplatePayload[],
): Promise<{ success: boolean; error?: string }> {
    if (payloads.length === 0) return { success: true };
    if (payloads.length > 500) {
        return { success: false, error: "Postmark max batch size is 500" };
    }

    const token = Deno.env.get("POSTMARK_BROADCAST_TOKEN");
    const fromEmail = Deno.env.get("POSTMARK_BROADCAST_FROM_EMAIL") ??
        Deno.env.get("POSTMARK_FROM_EMAIL") ?? "no-reply@news.casagrown.com";
    const messageStream = Deno.env.get("POSTMARK_BROADCAST_STREAM") ?? "broadcast";

    if (!token) {
        console.log(`📡 Local dev: Mocking Batch With Templates for ${payloads.length} emails to Mailpit...`);
        // We fallback to standard broadcast since Mailpit doesn't understand Postmark templates natively
        for (const p of payloads) {
            await sendBroadcastEmail({
                to: p.to,
                subject: `[TEMPLATE MOCK: ${p.templateAlias}]`,
                htmlBody: `<p>Template Model: <pre>${JSON.stringify(p.templateModel, null, 2)}</pre></p>`
            });
        }
        return { success: true };
    }

    const messages = payloads.map(p => ({
        From: fromEmail,
        To: p.to,
        TemplateAlias: p.templateAlias,
        TemplateModel: p.templateModel,
        MessageStream: messageStream,
        ...(p.metadata && { Metadata: p.metadata })
    }));

    try {
        const res = await fetch("https://api.postmarkapp.com/email/batchWithTemplates", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": token,
            },
            body: JSON.stringify({ Messages: messages })
        });

        if (!res.ok) {
            const errStr = await res.text();
            throw new Error(`Postmark template batch API error: ${res.status} ${errStr}`);
        }

        console.log(`📡 Template Batch sent via Postmark API: ${payloads.length} emails`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Template batch send failed:`, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
