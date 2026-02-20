
const { createClient } = require('@supabase/supabase-js');

// Use service role key to bypass RLS or update restricted columns
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function updateCilantro() {
  console.log('Updating Cilantro order to delivered...');
  
  const { data: orders, error: findError } = await supabase
    .from('orders')
    .select('id')
    .eq('product', 'Cilantro')
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1);

  if (findError || !orders || orders.length === 0) {
     console.error('Cilantro order not found or not accepted', findError);
     process.exit(1);
  }

  const targetId = orders[0].id;

  // Only update status and updated_at
  const { error: updateError } = await supabase
    .from('orders')
    .update({ 
      status: 'delivered',
      updated_at: new Date().toISOString()
    })
    .eq('id', targetId);

  if (updateError) {
    console.error('Update failed:', updateError);
    process.exit(1);
  }

  console.log('Successfully updated Cilantro order to delivered');
}

updateCilantro();
