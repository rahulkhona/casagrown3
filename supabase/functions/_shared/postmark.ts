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

interface EmailPayload {
    /** Recipient email address */
    to: string;
    /** Email subject line */
    subject: string;
    /** HTML body content */
    htmlBody: string;
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
    const fromEmail = Deno.env.get("POSTMARK_FROM_EMAIL") ??
        "no-reply@alerts.casagrown.com";
    const messageStream = Deno.env.get("POSTMARK_MESSAGE_STREAM") ??
        "outbound";

    // Determine SMTP config based on environment
    const isProduction = !!token;

    const smtpConfig = isProduction
        ? {
            // Production: Postmark SMTP
            hostname: "smtp.postmarkapp.com",
            port: 587,
            tls: true,
            auth: {
                username: token!,
                password: token!,
            },
        }
        : {
            // Local dev: Mailpit SMTP (no auth, no TLS)
            // Use host.docker.internal since edge functions run inside Docker
            hostname: "host.docker.internal",
            port: 54325,
            tls: false,
        };

    try {
        const client = new SMTPClient({
            connection: smtpConfig,
            // Allow non-TLS connections for local Mailpit
            ...(!isProduction && { debug: { allowUnsecure: true } }),
        });

        // deno-lint-ignore no-explicit-any
        const sendOpts: any = {
            from: fromEmail,
            to: payload.to,
            subject: payload.subject,
            content: "auto",
            html: payload.htmlBody,
        };

        // Only add Postmark headers in production
        if (isProduction) {
            sendOpts.headers = {
                "X-PM-Message-Stream": messageStream,
            };
        }

        await client.send(sendOpts);
        await client.close();

        if (isProduction) {
            console.log(
                `📧 Email sent via Postmark to ${payload.to}: ${payload.subject}`,
            );
        } else {
            console.log(
                `📧 Email sent to Mailpit for ${payload.to}: ${payload.subject} — check http://localhost:54324`,
            );
        }
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

    const isProduction = !!token;

    const smtpConfig = isProduction
        ? {
            // Production: Dedicated Broadcast Cluster
            hostname: "smtp-broadcasts.postmarkapp.com",
            port: 587,
            tls: true,
            auth: {
                username: token!,
                password: token!,
            },
        }
        : {
            // Local dev fallback
            hostname: "host.docker.internal",
            port: 54325,
            tls: false,
        };

    try {
        const client = new SMTPClient({
            connection: smtpConfig,
            ...(!isProduction && { debug: { allowUnsecure: true } }),
        });

        // deno-lint-ignore no-explicit-any
        const sendOpts: any = {
            from: fromEmail,
            to: payload.to,
            subject: payload.subject,
            content: "auto",
            html: payload.htmlBody,
        };

        if (isProduction) {
            sendOpts.headers = {
                "X-PM-Message-Stream": messageStream,
            };
        }

        await client.send(sendOpts);
        await client.close();

        if (isProduction) {
            console.log(`📡 Broadcast sent via Postmark to ${payload.to}: ${payload.subject}`);
        } else {
            console.log(`📡 Broadcast sent to Mailpit for ${payload.to}: ${payload.subject}`);
        }
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
