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

        const sendOpts: Record<string, unknown> = {
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
