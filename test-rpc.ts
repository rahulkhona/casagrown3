import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://fzdmszvfeewpwswlnfyk.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZG1zenZmZWV3cHdzd2xuZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc4ODEzNywiZXhwIjoyMDg5MzY0MTM3fQ.VhuNp3gix8XSJ1PvPD0DZ3NEMXq8MU_sK-j86X6Ry44"
);

const { data: dbData, error: dbError } = await supabase.from('redemptions').select('id, status').eq('status', 'queued');
console.log("Raw db query:", dbData);

const { data: rpcData, error: rpcError } = await supabase.rpc('get_pending_payouts_admin');
console.log("RPC query:", rpcData);
