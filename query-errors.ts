import { createClient } from "npm:@supabase/supabase-js@2";

// Next.js Admin env has NEXT_PUBLIC_SUPABASE_URL for local. Wait! I need Staging URL!
const SUPABASE_URL = "https://fzdmszvfeewpwswlnfyk.supabase.co";
// Wait, the .env in root has the local key! I need the staging service role key!
// Where is the Staging service role key?
// Let me look at supabase/config.toml to see if it has the project ref
