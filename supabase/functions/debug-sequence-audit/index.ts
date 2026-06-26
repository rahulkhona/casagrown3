/**
 * Temporary edge function to dump the onboarding sequence definition + lead data
 * for audit review. Returns the full sequence structure and a sample of leads.
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

  // Get all sequences
  const { data: sequences, error: seqErr } = await supabase
    .from("crm_sequences")
    .select("*")
    .order("created_at", { ascending: false });

  if (seqErr) {
    return new Response(JSON.stringify({ error: seqErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get sample leads with all fields
  const { data: leads, error: leadErr } = await supabase
    .from("crm_leads")
    .select("*")
    .limit(20);

  // Get crm_leads column info
  const { data: cols } = await supabase.rpc("get_table_columns", { p_table: "crm_leads" }).maybeSingle();

  // Get enrollments for active sequences
  const activeSeqIds = (sequences || []).filter(s => s.status === 'active' || s.name.toLowerCase().includes('onboard')).map(s => s.id);
  let enrollments: any[] = [];
  if (activeSeqIds.length > 0) {
    const { data: enrollData } = await supabase
      .from("crm_sequence_enrollments")
      .select("*")
      .in("sequence_id", activeSeqIds)
      .limit(50);
    enrollments = enrollData || [];
  }

  return new Response(JSON.stringify({
    sequences: sequences || [],
    sample_leads: leads || [],
    lead_error: leadErr?.message,
    enrollments,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
