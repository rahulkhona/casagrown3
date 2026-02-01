
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is missing. Cannot create mock user.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createMockUser() {
  const email = 'mock@social.com';
  const password = 'test1234';
  const fullName = 'Mock Social User';
  const avatarUrl = 'https://ui-avatars.com/api/?name=Mock+User&background=random';

  console.log(`🔍 Checking if user ${email} exists...`);

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Error listing users:', listError.message);
    process.exit(1);
  }

  const existingUser = users.find((u) => u.email === email);

  if (existingUser) {
    console.log('✅ Mock user already exists.');
    return;
  }

  console.log('👤 Creating mock user...');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      avatar_url: avatarUrl,
      iss: 'https://accounts.google.com', // Simulate Google provider metadata
    },
  });

  if (error) {
    console.error('❌ Failed to create mock user:', error.message);
    process.exit(1);
  }

  console.log('✅ Mock user created successfully:', data.user.id);
}

createMockUser();
