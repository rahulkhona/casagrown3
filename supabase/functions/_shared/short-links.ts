import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SITE_URL = Deno.env.get("SITE_URL") || "https://casagrown.com";

/** Helper: Expand any existing Casagrown /r/[token] short links back to their raw destination URLs */
async function expandShortLinks(
  text: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const shortLinkRegex = /https?:\/\/[^/\s]+\/r\/([a-zA-Z0-9]{8})/gi;
  let expandedText = text;
  const matches = [...text.matchAll(shortLinkRegex)];

  for (const match of matches) {
    const fullUrl = match[0];
    const token = match[1];

    const { data, error } = await supabase
      .from("crm_short_links")
      .select("destination_url")
      .eq("token", token)
      .maybeSingle();

    if (!error && data?.destination_url) {
      expandedText = expandedText.replaceAll(fullUrl, data.destination_url);
    }
  }

  return expandedText;
}

/** Generate a random 8-char token and insert into crm_short_links */
export async function createShortLink(
  destinationUrl: string,
  recipientId: string,
  recipientType: string,
  supabase: ReturnType<typeof createClient>,
  options: {
    campaignId?: string | null;
    sequenceId?: string | null;
    nodeId?: string | null;
    variantId?: string | null;
  } = {}
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
    variant_id: options.variantId || null,
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
  options: {
    campaignId?: string | null;
    sequenceId?: string | null;
    nodeId?: string | null;
    variantId?: string | null;
  } = {}
): Promise<string> {
  // First, expand any existing short links in the SMS text
  let expandedText = await expandShortLinks(text, supabase);

  const urlRegex = /https?:\/\/\S+/g;
  const replacements: Array<[string, string]> = [];

  for (const match of expandedText.matchAll(urlRegex)) {
    const originalUrl = match[0];
    // Skip if it is already a shortened link from our domain
    if (originalUrl.includes("/r/") && (originalUrl.includes("casagrown.com") || originalUrl.includes(SITE_URL))) {
      continue;
    }
    const token = await createShortLink(originalUrl, recipientId, recipientType, supabase, options);
    replacements.push([originalUrl, `${SITE_URL}/r/${token}`]);
  }

  let result = expandedText;
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
  options: {
    campaignId?: string | null;
    sequenceId?: string | null;
    nodeId?: string | null;
    variantId?: string | null;
  } = {}
): Promise<string> {
  // First, expand any existing short links in the HTML href attributes
  let expandedHtml = await expandShortLinks(html, supabase);

  const urlRegex = /href="(https?:\/\/[^"]+)"/g;
  const replacements: Array<[string, string]> = [];

  for (const match of expandedHtml.matchAll(urlRegex)) {
    const originalUrl = match[1];
    // Skip if it is already a shortened link from our domain
    if (originalUrl.includes("/r/") && (originalUrl.includes("casagrown.com") || originalUrl.includes(SITE_URL))) {
      continue;
    }
    const token = await createShortLink(originalUrl, recipientId, recipientType, supabase, options);
    replacements.push([originalUrl, `${SITE_URL}/r/${token}`]);
  }

  let result = expandedHtml;
  for (const [original, branded] of replacements) {
    result = result.replace(`href="${original}"`, `href="${branded}"`);
  }
  return result;
}
