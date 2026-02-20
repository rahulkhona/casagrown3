
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKETS = [
  { id: 'avatars', public: true },
  { id: 'post-media', public: true }, // Handles both images and videos for posts
  { id: 'chat-media', public: false }, // Private bucket for chat
  { id: 'delivery-proofs', public: false }, // For order delivery proofs
  { id: 'dispute-proofs', public: false }   // For dispute evidence
];

async function initStorage() {
  console.log('📦 Initializing Storage Buckets...');

  for (const bucket of BUCKETS) {
    const { data, error } = await supabase.storage.getBucket(bucket.id);

    if (error && error.message.includes('not found')) {
      console.log(`   Creating bucket: ${bucket.id} (${bucket.public ? 'public' : 'private'})...`);
      const { error: createError } = await supabase.storage.createBucket(bucket.id, {
        public: bucket.public,
        fileSizeLimit: 52428800, // 50MB
      });

      if (createError) {
        console.error(`   ❌ Failed to create ${bucket.id}:`, createError.message);
      } else {
        console.log(`   ✅ Created ${bucket.id}`);
      }
    } else if (data) {
      console.log(`   ✅ Bucket ${bucket.id} already exists.`);
    } else {
      console.error(`   ❌ Error checking ${bucket.id}:`, error.message);
    }
  }
}

initStorage();
