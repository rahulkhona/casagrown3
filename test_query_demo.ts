import "https://deno.land/std@0.192.0/dotenv/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  const { data: booths } = await supabase.from('market_booths').select('id, name, is_open, status')
    .ilike('name', '%Demo%');
  console.log('Demo Booths:', booths);

  if (booths && booths.length) {
    const ids = booths.map(b => b.id);
    const { data: products } = await supabase.from('market_products').select('id, name, status, moderation_status').in('booth_id', ids);
    console.log('Products for demo booths:', products);
  }
}
run();
