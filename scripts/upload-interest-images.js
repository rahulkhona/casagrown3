/**
 * Upload all studio_*.jpg images to the interest-images bucket.
 * Follows the exact same pattern as scripts/init-storage.js:
 *   SUPABASE_SERVICE_ROLE_KEY="$KEY" node scripts/upload-interest-images.js
 *
 * The service role key is fetched by release-test.sh via:
 *   npx supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'"' -f2
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required.')
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY="$(npx supabase status -o env | grep SERVICE_ROLE_KEY | cut -d\'"\' -f2)" node scripts/upload-interest-images.js')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const BUCKET = 'interest-images'

// Master interest catalog image source directories
const ARTIFACT_DIRS = [
  path.join(__dirname, '../apps/next-market/public/images/catalog'),
  path.join(process.env.HOME, '.gemini/antigravity/brain/e887be4b-c6f6-4ab6-81be-942f386a399a'),
  path.join(process.env.HOME, '.gemini/antigravity/brain/586241b3-b542-4942-bf41-e8e1f0f94e76'),
]

function getCanonicalName(filename) {
  // studio_apples_1786052232829.jpg -> studio_apples.jpg
  // fresh_broccoli_... -> studio_broccoli.jpg (normalize fresh_ -> studio_)
  let base = filename.replace(/_\d{13}\.jpg$/, '.jpg')
  base = base.replace(/^fresh_/, 'studio_')
  // honeydew_melon -> honeydew (catalog uses studio_honeydew.jpg)
  base = base.replace('studio_honeydew_melon.jpg', 'studio_honeydew.jpg')
  return base
}

async function uploadImages() {
  console.log('📸 Uploading interest catalog images to interest-images bucket...')
  console.log(`   Supabase URL: ${SUPABASE_URL}`)

  const uploaded = new Set()
  let ok = 0
  let failed = 0
  let skipped = 0

  for (const dir of ARTIFACT_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`   ⚠️  Artifact directory not found (skipping): ${dir}`)
      continue
    }

    const files = fs.readdirSync(dir).filter(f =>
      (f.startsWith('studio_') || f.startsWith('fresh_')) && f.endsWith('.jpg')
    )

    for (const file of files) {
      const canonical = getCanonicalName(file)
      if (uploaded.has(canonical)) {
        skipped++
        continue
      }
      uploaded.add(canonical)

      const filePath = path.join(dir, file)
      const fileContent = fs.readFileSync(filePath)

      process.stdout.write(`   Uploading ${canonical}... `)
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(canonical, fileContent, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (error) {
        console.log(`❌ ${error.message}`)
        failed++
      } else {
        console.log('✅')
        ok++
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────')
  console.log(`   ✅ Uploaded: ${ok}`)
  console.log(`   ⏩ Skipped (duplicate): ${skipped}`)
  if (failed > 0) {
    console.log(`   ❌ Failed:   ${failed}`)
    process.exit(1)
  } else {
    console.log(`   🎉 All images uploaded successfully!`)
  }
}

uploadImages().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
