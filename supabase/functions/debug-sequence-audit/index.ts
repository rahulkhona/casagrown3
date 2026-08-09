/**
 * Temporary: Returns sequence definition + all leads with eval context
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get onboarding sequence
  const { data: seq } = await supabase
    .from("crm_sequences")
    .select("id, name, definition")
    .ilike("name", "%onboard%")
    .single();

  if (!seq) {
    return new Response(JSON.stringify({ error: "No onboarding sequence found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get ALL leads
  const { data: leads, error: leadErr } = await supabase
    .from("crm_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (leadErr) {
    return new Response(JSON.stringify({ error: leadErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get profiles matching lead emails (for converted users check & listings)
  const leadEmails = (leads || []).map((l: any) => l.email).filter(Boolean);
  
  let profileMapByEmail: Record<string, any> = {};
  let sellersWithListings: string[] = [];
  
  if (leadEmails.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, tos_accepted_at, full_name")
      .in("email", leadEmails);
      
    if (profiles && profiles.length > 0) {
      profiles.forEach((p: any) => { profileMapByEmail[p.email.toLowerCase()] = p; });
      const userIds = profiles.map((p: any) => p.id);
      
      const { data: products } = await supabase
        .from("market_products")
        .select("seller_id")
        .in("seller_id", userIds);
      if (products) {
        sellersWithListings = [...new Set(products.map((p: any) => p.seller_id))];
      }
    }
  }

  // Build eval context per lead
  const leadsWithContext = (leads || []).map((lead: any) => {
    const hasEmail = typeof lead.email === "string" && lead.email.trim().length > 0;
    const hasPhone = typeof lead.phone === "string" && lead.phone.trim().length > 0;
    const profile = lead.email ? profileMapByEmail[lead.email.toLowerCase()] : null;
    const hasListings = profile
      ? sellersWithListings.includes(profile.id)
      : false;

    const now = Date.now();
    const lastActive = lead.last_active_at ? new Date(lead.last_active_at).getTime() : now;
    const daysSinceActive = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));

    return {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source_platform: lead.source_platform,
      status: lead.status,
      accepts_email: lead.accepts_email,
      accepts_sms: lead.accepts_sms,
      converted_user_id: lead.converted_user_id,
      created_at: lead.created_at,
      profile_completed_at: lead.profile_completed_at,
      eval_context: {
        has_only_email: hasEmail && !hasPhone,
        has_only_phone: hasPhone && !hasEmail,
        has_both_email_and_phone: hasEmail && hasPhone,
        has_completed_profile: !!lead.profile_completed_at,
        has_signed_tos: !!profile?.tos_accepted_at,
        has_created_listings: hasListings,
        email_enabled: lead.accepts_email !== false,
        sms_enabled: lead.accepts_sms !== false,
        days_since_last_active: daysSinceActive,
      },
    };
  });

  return new Response(JSON.stringify({
    sequence_id: seq.id,
    sequence_name: seq.name,
    definition: seq.definition,
    leads: leadsWithContext,
    sellers_with_listings: sellersWithListings,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
