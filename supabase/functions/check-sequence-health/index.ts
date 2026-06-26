/**
 * check-sequence-health
 *
 * For each active sequence, walks each enrollment's path from start to
 * their current_node_id, counts which action nodes they SHOULD have
 * passed, and compares to actual crm_campaign_sends records.
 *
 * Alerts admin@casagrown.com if actual sends < 50% of expected.
 *
 * Triggered by pg_cron (hourly) or manual POST.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

const ALERT_EMAIL = "admin@casagrown.com";
const THRESHOLD = 0.5; // alert if actual < 50% of expected

import { evaluateRule, evaluateQuery } from '../_shared/evaluate.ts';


/**
 * Walk the graph from startNodeId, simulating condition branches using evalContext,
 * and collect all action nodes the lead SHOULD pass through on their path.
 */
function getExpectedActions(
  def: any,
  startNodeId: string,
  currentNodeId: string,
  evalContext: any
): { expectedEmails: string[]; expectedSms: string[] } {
  const nodes = new Map<string, any>();
  for (const n of def.nodes) nodes.set(n.id, n);
  
  const adj = new Map<string, { label: string; target: string }[]>();
  for (const e of def.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ label: e.label || '', target: e.target });
  }
  
  const expectedEmails: string[] = [];
  const expectedSms: string[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = startNodeId;
  
  while (nodeId && !visited.has(nodeId) && visited.size < 50) {
    visited.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) break;
    
    const d = node.data || {};
    const type = d.type || node.type || '';
    
    if (type === 'terminal') break;
    
    // If we've reached the enrollment's current node, stop — 
    // they haven't passed this node yet
    if (nodeId === currentNodeId) break;
    
    if (type === 'action_email') {
      expectedEmails.push(nodeId);
    } else if (type === 'action_sms') {
      expectedSms.push(nodeId);
    }
    
    if (type === 'condition') {
      const mode = d.conditionMode || 'rules';
      // AI conditions: skip (assume false — conservative)
      const met = mode === 'ai' ? false : evaluateQuery(d.query, evalContext);
      const outgoing = adj.get(nodeId) || [];
      const branch = met ? 'true' : 'false';
      const edge = outgoing.find(e => e.label === branch) || outgoing[0];
      nodeId = edge?.target || null;
      continue;
    }
    
    // Follow single outgoing edge
    const outgoing = adj.get(nodeId) || [];
    nodeId = outgoing.length > 0 ? outgoing[0].target : null;
  }
  
  return { expectedEmails, expectedSms };
}

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

    const alerts: {
      name: string;
      expectedEmails: number;
      expectedSms: number;
      actualEmails: number;
      actualSms: number;
      enrollments: number;
      missingDetails: { recipientId: string; missingNodes: string[] }[];
    }[] = [];

    for (const seq of sequences) {
      const def = seq.definition || { nodes: [], edges: [], startNodeId: null };
      if (!def.startNodeId) continue;

      // Get all enrollments with current_node_id
      const { data: enrollments } = await supabase
        .from("crm_sequence_enrollments")
        .select("id, recipient_id, recipient_type, current_node_id")
        .eq("sequence_id", seq.id)
        .in("status", ["active", "completed"]);

      if (!enrollments || enrollments.length === 0) continue;

      // Get all sends for this sequence
      const { data: sends } = await supabase
        .from("crm_campaign_sends")
        .select("recipient_id, node_id, email, phone, sent_at, error")
        .eq("sequence_id", seq.id);

      // Index sends by recipient+node
      const sendIndex = new Set<string>();
      for (const s of (sends || [])) {
        if (s.sent_at && !s.error) {
          sendIndex.add(`${s.recipient_id}:${s.node_id}`);
        }
      }

      // Get lead metadata for eval context
      const recipientIds = enrollments.map((e: any) => e.recipient_id);
      const { data: leadsMeta } = await supabase
        .from("crm_leads")
        .select("id, email, phone, accepts_email, accepts_sms, converted_user_id, profile_completed_at")
        .in("id", recipientIds.slice(0, 500));

      const leadMap = new Map<string, any>();
      (leadsMeta || []).forEach((l: any) => leadMap.set(l.id, l));

      let totalExpectedEmails = 0;
      let totalExpectedSms = 0;
      let totalActualEmails = 0;
      let totalActualSms = 0;
      const missingDetails: { recipientId: string; missingNodes: string[] }[] = [];

      for (const enr of enrollments) {
        const lead = leadMap.get(enr.recipient_id) || {};
        const hasEmail = typeof lead.email === 'string' && lead.email.trim().length > 0;
        const hasPhone = typeof lead.phone === 'string' && lead.phone.trim().length > 0;

        const evalContext = {
          ...lead,
          has_email: hasEmail,
          has_phone: hasPhone,
          has_only_email: hasEmail && !hasPhone,
          has_only_phone: hasPhone && !hasEmail,
          has_both_email_and_phone: hasEmail && hasPhone,
          has_completed_profile: !!lead.profile_completed_at,
          has_created_listings: false, // conservative
          email_enabled: lead.accepts_email !== false,
          sms_enabled: lead.accepts_sms !== false,
        };

        const { expectedEmails, expectedSms } = getExpectedActions(
          def,
          def.startNodeId,
          enr.current_node_id,
          evalContext
        );

        totalExpectedEmails += expectedEmails.length;
        totalExpectedSms += expectedSms.length;

        // Check which expected sends actually happened
        const missing: string[] = [];
        for (const nodeId of expectedEmails) {
          if (sendIndex.has(`${enr.recipient_id}:${nodeId}`)) {
            totalActualEmails++;
          } else {
            missing.push(nodeId);
          }
        }
        for (const nodeId of expectedSms) {
          if (sendIndex.has(`${enr.recipient_id}:${nodeId}`)) {
            totalActualSms++;
          } else {
            missing.push(nodeId);
          }
        }
        if (missing.length > 0) {
          missingDetails.push({ recipientId: enr.recipient_id, missingNodes: missing });
        }
      }

      // Check threshold
      const totalExpected = totalExpectedEmails + totalExpectedSms;
      const totalActual = totalActualEmails + totalActualSms;
      const belowThreshold = totalExpected > 0 && totalActual < totalExpected * THRESHOLD;

      if (belowThreshold) {
        alerts.push({
          name: seq.name,
          expectedEmails: totalExpectedEmails,
          expectedSms: totalExpectedSms,
          actualEmails: totalActualEmails,
          actualSms: totalActualSms,
          enrollments: enrollments.length,
          missingDetails: missingDetails.slice(0, 10), // top 10 for the alert
        });
      }
    }

    // 2. Send alert email if any sequences are below threshold
    if (alerts.length > 0) {
      const rows = alerts.map(a =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:500">${a.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${a.enrollments}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${a.expectedEmails}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${a.actualEmails < a.expectedEmails * THRESHOLD ? '#dc2626' : '#16a34a'};font-weight:700">${a.actualEmails}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${a.expectedSms}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${a.actualSms < a.expectedSms * THRESHOLD ? '#dc2626' : '#16a34a'};font-weight:700">${a.actualSms}</td>
        </tr>`
      ).join("");

      const html = `
        <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
          <h2 style="color:#991b1b">⚠️ Sequence Health Alert</h2>
          <p>The following sequences have sent <strong>less than 50%</strong> of expected messages:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Sequence</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Enrolled</th>
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
          TextBody: alerts.map(a => `${a.name}: ${a.actualEmails}/${a.expectedEmails} emails, ${a.actualSms}/${a.expectedSms} SMS (${a.enrollments} enrolled)`).join("\n"),
          MessageStream: "outbound",
        }),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      checked: sequences.length,
      alerts: alerts.length,
      details: alerts,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
