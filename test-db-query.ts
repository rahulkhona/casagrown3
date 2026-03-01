import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const envContent = await Deno.readTextFile('.env.local');
const envVars = Object.fromEntries(envContent.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')));
const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || envVars.SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const { data, error } = await supabase.from('point_ledger').select('id, type, amount, reference_id, metadata').order('created_at', { ascending: false }).limit(6);
console.log(JSON.stringify(data, null, 2));
