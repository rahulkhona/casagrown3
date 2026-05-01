import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
);

// First insert a test queued redemption!
await supabase.from("redemptions").insert({
  id: "00000000-0000-0000-0000-000000000123",
  user_id: "00000000-0000-0000-0000-000000000001",
  status: "queued",
  point_cost: 500,
  item_id: null,
});

const { data, error } = await supabase.rpc('get_pending_payouts_admin');
console.log("RPC Error:", error);
console.log("RPC Data:", data);
