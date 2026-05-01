import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

const rs = await sql`
  SELECT COALESCE(SUM(capture_amount_usd), 0) as v_cc_charged
  FROM settlement_captures
  WHERE buyer_id = 'd0e7cd9d-9954-415f-8ebb-5e5ee42fdded' 
    AND capture_status = 'captured'
    AND created_at >= '2026-05-01T00:00:00.000Z'::timestamptz 
    AND created_at <= '2026-05-01T23:59:59.999Z'::timestamptz;
`;
console.log("With Dates:", rs[0]);

const rs_all = await sql`
  SELECT COALESCE(SUM(capture_amount_usd), 0) as v_cc_charged
  FROM settlement_captures
  WHERE buyer_id = 'd0e7cd9d-9954-415f-8ebb-5e5ee42fdded' 
    AND capture_status = 'captured';
`;
console.log("Without Dates:", rs_all[0]);
await sql.end();
