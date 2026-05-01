import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://fzdmszvfeewpwswlnfyk.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZG1zenZmZWV3cHdzd2xuZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc4ODEzNywiZXhwIjoyMDg5MzY0MTM3fQ.VhuNp3gix8XSJ1PvPD0DZ3NEMXq8MU_sK-j86X6Ry44"
);

// Call with string dates matching what was sent before (without time)
const { data: dataOld, error: errorOld } = await supabase.rpc('get_transaction_summary', {
  p_start_date: '2026-05-01',
  p_end_date: '2026-05-01'
});

console.log("With '2026-05-01':", dataOld);

// Call with full ISO string timestamps
const { data: dataNew, error: errorNew } = await supabase.rpc('get_transaction_summary', {
  p_start_date: '2026-05-01T07:00:00.000Z',
  p_end_date: '2026-05-02T06:59:59.999Z'
});

console.log("With ISO Strings:", dataNew);

// What about getting everything by not passing dates?
const { data: dataAll } = await supabase.rpc('get_transaction_summary');
console.log("Without dates:", dataAll);
