import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const key = Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const supabase = createClient(url, key);

const { data } = await supabase.from('market_products').select('name, window_dates, product_delivery_windows, product_pickup_windows').eq('name', 'Meyer Lemons');
console.log(JSON.stringify(data, null, 2));
