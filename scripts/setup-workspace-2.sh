#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CasaGrown — Complete Workspace Setup Script v2
#
# Bootstraps local .env files across all 10 apps, root level, and Supabase
# edge functions for new workspaces and git worktrees.
# ═══════════════════════════════════════════════════════════════════════════
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

APPS=(
  "apps/next-market"
  "apps/next-admin"
  "apps/next-community"
  "apps/next-community-voice"
  "apps/next-metrics"
  "apps/next-pro"
  "apps/expo-market"
  "apps/expo-admin"
  "apps/expo-community"
  "apps/quarantine-bot"
)

# Standard local dev defaults
DEFAULT_SUPABASE_URL="http://127.0.0.1:54321"
DEFAULT_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
DEFAULT_PUBLISHABLE_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
DEFAULT_SERVICE_ROLE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

echo -e "\033[1;36mBootstrapping CasaGrown Workspace Environment (v2)...\033[0m"

# 1. Setup Root .env
ROOT_ENV="$ROOT_DIR/.env"
if [ ! -f "$ROOT_ENV" ]; then
  # Check if parent workspace casagrown3 has a root .env we can copy from
  PARENT_ENV="$ROOT_DIR/../casagrown3/.env"
  if [ -f "$PARENT_ENV" ]; then
    echo -e "  \033[0;32m✓ Copying root .env from parent workspace ($PARENT_ENV)\033[0m"
    cp "$PARENT_ENV" "$ROOT_ENV"
  else
    echo -e "  \033[0;33mCreating root .env with default local values\033[0m"
    cat <<EOF > "$ROOT_ENV"
NEXT_PUBLIC_SUPABASE_URL=$DEFAULT_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$DEFAULT_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$DEFAULT_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=$DEFAULT_SERVICE_ROLE
STRIPE_SECRET_KEY=sk_test_placeholder
NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION="true"
NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN="true"
EOF
  fi
else
  echo -e "  \033[0;32m✓ Root .env already exists\033[0m"
fi

# 2. Setup App .env files for all 10 apps
for path in "${APPS[@]}"; do
  ENV_FILE="$ROOT_DIR/$path/.env"
  if [ ! -d "$ROOT_DIR/$path" ]; then
    echo -e "  \033[0;30mSkipping $path (directory not found)\033[0m"
    continue
  fi

  if [ ! -f "$ENV_FILE" ]; then
    echo -e "  \033[0;33mCreating $path/.env\033[0m"
    cat <<EOF > "$ENV_FILE"
IGNORE_TS_CONFIG_PATHS=true
TAMAGUI_TARGET=web
TAMAGUI_DISABLE_WARN_DYNAMIC_LOAD=1

NEXT_PUBLIC_SUPABASE_URL=$DEFAULT_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$DEFAULT_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$DEFAULT_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=$DEFAULT_SERVICE_ROLE
NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION="true"
NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN="true"
EOF
  else
    echo -e "  \033[0;32m✓ $path/.env already exists\033[0m"
  fi
done

# 3. Setup Supabase Edge Functions local env
EDGE_ENV="$ROOT_DIR/supabase/.env.local"
if [ ! -f "$EDGE_ENV" ]; then
  PARENT_EDGE_ENV="$ROOT_DIR/../casagrown3/supabase/.env.local"
  if [ -f "$PARENT_EDGE_ENV" ]; then
    echo -e "  \033[0;32m✓ Copying supabase/.env.local from parent workspace\033[0m"
    cp "$PARENT_EDGE_ENV" "$EDGE_ENV"
  else
    echo -e "  \033[0;33mCreating supabase/.env.local with placeholder defaults\033[0m"
    cat <<EOF > "$EDGE_ENV"
STRIPE_SECRET_KEY="sk_test_placeholder"
STRIPE_WEBHOOK_SECRET="whsec_placeholder"
EOF
  fi
else
  echo -e "  \033[0;32m✓ supabase/.env.local already exists\033[0m"
fi

echo -e "\n\033[1;32mWorkspace bootstrap complete! Run 'yarn install' and './scripts/release-test.sh' to verify.\033[0m"
