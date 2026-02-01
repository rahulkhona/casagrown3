#!/bin/bash
set -e

# Reset Database (re-apply migrations & run seed.sql)
echo "♻️  Resetting and Seeding Database..."
npx supabase db reset --yes

echo "👤 Creating Mock User..."
# Use provided key or fallback to local default
export SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz}
npx tsx scripts/create-mock-user.ts

echo "✅ Database is clean and seeded."
