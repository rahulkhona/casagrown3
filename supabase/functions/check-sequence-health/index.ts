/**
 * check-sequence-health
 *
 * Checks all active sequences: if actual sends are < 50% of expected,
 * sends an alert email to admin@casagrown.com via Postmark.
 *
 * Triggered by pg_cron (hourly) or manual POST.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

const ALERT_EMAIL = "admin@casagrown.com";
const THRESHOLD = 0.5; // alert if actual < 50% of expected

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const postmarkToken = Deno.env.get("POSTMARK_SERVER_TOKEN");
  if (!postmarkToken) {
    return new Response(JSON.stringify({ error: "POSTMARK_SERVER_TOKEN not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Get all active sequences
    const { data: sequences, error: seqErr } = await supabase
      .from("crm_sequences")
      .select("id, name, definition")
      .eq("status", "active");

    if (seqErr) throw seqErr;
    if (!sequences || sequences.length === 0) {
      return new Response(JSON.stringify({ message: "No active sequences" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alerts: { name: string; expectedEmails: number; expectedSms: number; actualEmails: number; actualSms: number }[] = [];

    for (const seq of sequences) {
      const def = seq.definition || { nodes: [] };
      const nodes = def.nodes || [];

      const emailNodes = nodes.filter((n: any) => (n.data?.type || n.type) === "action_email").length;
      const smsNodes = nodes.filter((n: any) => (n.data?.type || n.type) === "action_sms").length;

      if (emailNodes === 0 && smsNodes === 0) continue;

      // Count enrollments
      const { count: enrollCount } = await supabase
        .from("crm_sequence_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("sequence_id", seq.id);

      const totalEnrolled = enrollCount || 0;
      if (totalEnrolled === 0) continue;

      const expectedEmails = emailNodes * totalEnrolled;
      const expectedSms = smsNodes * totalEnrolled;

      // Count actual sends (non-error)
      const { data: sends } = await supabase
        .from("crm_campaign_sends")
        .select("email, phone, error")
        .eq("sequence_id", seq.id)
        .not("sent_at", "is", null);

      const actualSends = (sends || []).filter((s: any) => !s.error);
      const actualEmails = actualSends.filter((s: any) => s.email).length;
      const actualSms = actualSends.filter((s: any) => s.phone && !s.email).length;

      // Check threshold
      const emailBelowThreshold = expectedEmails > 0 && actualEmails < expectedEmails * THRESHOLD;
      const smsBelowThreshold = expectedSms > 0 && actualSms < expectedSms * THRESHOLD;

      if (emailBelowThreshold || smsBelowThreshold) {
        alerts.push({ name: seq.name, expectedEmails, expectedSms, actualEmails, actualSms });
      }
    }

    // 2. Send alert if any sequences are below threshold
    if (alerts.length > 0) {
      const rows = alerts.map(a =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:500">${a.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${a.expectedEmails}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${a.actualEmails < a.expectedEmails * THRESHOLD ? '#dc2626' : '#16a34a'};font-weight:700">${a.actualEmails}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${a.expectedSms}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${a.actualSms < a.expectedSms * THRESHOLD ? '#dc2626' : '#16a34a'};font-weight:700">${a.actualSms}</td>
        </tr>`
      ).join("");

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#991b1b">⚠️ Sequence Health Alert</h2>
          <p>The following sequences have sent <strong>less than 50%</strong> of expected messages:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Sequence</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Expected Emails</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Actual Emails</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Expected SMS</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Actual SMS</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:16px;color:#6b7280;font-size:13px">
            Check the <a href="https://admin.casagrown.com/crm/sequences">Monitoring Dashboard</a> for details.
          </p>
        </div>
      `;

      await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": postmarkToken,
        },
        body: JSON.stringify({
          From: Deno.env.get("POSTMARK_FROM_EMAIL") || "no-reply@alerts.casagrown.com",
          To: ALERT_EMAIL,
          Subject: `⚠️ Sequence Alert: ${alerts.length} sequence(s) below 50% send rate`,
          HtmlBody: html,
          TextBody: alerts.map(a => `${a.name}: ${a.actualEmails}/${a.expectedEmails} emails, ${a.actualSms}/${a.expectedSms} SMS`).join("\n"),
          MessageStream: "outbound",
        }),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      checked: sequences.length,
      alerts: alerts.length,
      details: alerts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
