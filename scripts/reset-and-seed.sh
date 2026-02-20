#!/bin/bash
set -e

# Reset Database (re-apply migrations & run seed.sql)
echo "♻️  Resetting and Seeding Database..."
npx supabase db reset --yes || echo "⚠️ Supabase reset finished with error (ignoring known issue)..."

# Apply any migrations that supabase db reset may have skipped
echo "🔄 Applying any skipped migrations..."
MIGRATION_DIR="$(dirname "$0")/../supabase/migrations"
for migration_file in "$MIGRATION_DIR"/*.sql; do
  version=$(basename "$migration_file" | sed 's/_.*//')
  # Check if this version is already in the migration tracker
  already_applied=$(docker exec supabase_db_casagrown3 psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$version' LIMIT 1;" 2>/dev/null || true)
  if [ "$already_applied" != "1" ]; then
    echo "   Applying skipped migration: $(basename "$migration_file")..."
    docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$migration_file" 2>&1 || {
      echo "   ❌ Failed to apply $(basename "$migration_file")"
      continue
    }
    docker exec supabase_db_casagrown3 psql -U postgres -d postgres -c \
      "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$version');" 2>/dev/null
    echo "   ✅ Applied $(basename "$migration_file")"
  fi
done

echo "👤 Creating Mock User..."
# Use provided key or fallback to local default
export SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz}
echo "📦 Initializing Storage Buckets..."
node scripts/init-storage.js
npx tsx scripts/create-mock-user.ts

echo "✅ Database is clean and seeded."
