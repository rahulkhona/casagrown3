import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

// We can't connect directly via postgresjs, but we can call a REST endpoint or RPC.
// Wait, we can't easily get the function definition via PostgREST.
