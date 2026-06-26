import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SITE_URL = Deno.env.get("SITE_URL") || "https://casagrown.com";

/** Generate a random 8-char token and insert into crm_short_links */
export async function createShortLink(
  destinationUrl: string,
  recipientId: string,
  recipientType: string,
  supabase: ReturnType<typeof createClient>,
  options: { campaignId?: string | null; sequenceId?: string | null; nodeId?: string | null } = {}
): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8);

  await supabase.from("crm_short_links").insert({
    token,
    destination_url: destinationUrl,
    campaign_id: options.campaignId || null,
    sequence_id: options.sequenceId || null,
    node_id: options.nodeId || null,
    recipient_id: recipientId,
    recipient_type: recipientType,
    is_shared: true,
  });

  return token;
}

/** Replace URLs in plain text / SMS content with branded short links */
export async function rewriteLinksText(
  text: string,
  recipientId: string,
  recipientType: string,
  supabase: ReturnType<typeof createClient>,
  options: { campaignId?: string | null; sequenceId?: string | null; nodeId?: string | null } = {}
): Promise<string> {
  const urlRegex = /https?:\/\/\S+/g;
  const replacements: Array<[string, string]> = [];

  for (const match of text.matchAll(urlRegex)) {
    const originalUrl = match[0];
    // Skip if it is already a shortened link from our domain
    if (originalUrl.includes("/r/") && (originalUrl.includes("casagrown.com") || originalUrl.includes(SITE_URL))) {
      continue;
    }
    const token = await createShortLink(originalUrl, recipientId, recipientType, supabase, options);
    replacements.push([originalUrl, `${SITE_URL}/r/${token}`]);
  }

  let result = text;
  for (const [original, branded] of replacements) {
    result = result.replace(original, branded);
  }
  return result;
}

/** Replace all http(s) links in HTML with casagrown.com/r/[token] branded links */
export async function rewriteLinks(
  html: string,
  recipientId: string,
  recipientType: string,
  supabase: ReturnType<typeof createClient>,
  options: { campaignId?: string | null; sequenceId?: string | null; nodeId?: string | null } = {}
): Promise<string> {
  const urlRegex = /href="(https?:\/\/[^"]+)"/g;
  const replacements: Array<[string, string]> = [];

  for (const match of html.matchAll(urlRegex)) {
    const originalUrl = match[1];
    // Skip if it is already a shortened link from our domain
    if (originalUrl.includes("/r/") && (originalUrl.includes("casagrown.com") || originalUrl.includes(SITE_URL))) {
      continue;
    }
    const token = await createShortLink(originalUrl, recipientId, recipientType, supabase, options);
    replacements.push([originalUrl, `${SITE_URL}/r/${token}`]);
  }

  let result = html;
  for (const [original, branded] of replacements) {
    result = result.replace(`href="${original}"`, `href="${branded}"`);
  }
  return result;
}
