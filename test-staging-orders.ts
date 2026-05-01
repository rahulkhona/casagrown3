import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://fzdmszvfeewpwswlnfyk.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZG1zenZmZWV3cHdzd2xuZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc4ODEzNywiZXhwIjoyMDg5MzY0MTM3fQ.VhuNp3gix8XSJ1PvPD0DZ3NEMXq8MU_sK-j86X6Ry44"
);

const { data: purchases } = await supabase.from('market_orders').select('created_at, total_usd').eq('buyer_id', 'd0e7cd9d-9954-415f-8ebb-5e5ee42fdded');
console.log("Purchases:", purchases);

const { data: sales } = await supabase.from('market_orders').select('created_at, subtotal_usd').eq('seller_id', 'd0e7cd9d-9954-415f-8ebb-5e5ee42fdded');
console.log("Sales:", sales);
