#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CasaGrown — Workspace Setup Script
#
# Bootstraps local .env files and checks dependencies for a new workspace.
# ═══════════════════════════════════════════════════════════════════════════
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

APPS=(
  "apps/next-market"
  "apps/next-admin"
  "apps/next-community-voice"
  "apps/next-metrics"
)

# Standard local dev values
DEFAULT_SUPABASE_URL="http://127.0.0.1:54321"
DEFAULT_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
DEFAULT_SERVICE_ROLE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

echo -e "\033[1;36mBootstrapping CasaGrown Workspace Environment...\033[0m"

# 1. Create or verify .env for all frontend apps
for path in "${APPS[@]}"; do
  ENV_FILE="$ROOT_DIR/$path/.env"
  if [ ! -f "$ENV_FILE" ]; then
    echo -e "  \033[0;33mCreating $path/.env\033[0m"
    cat <<EOF > "$ENV_FILE"
IGNORE_TS_CONFIG_PATHS=true
TAMAGUI_TARGET=web
TAMAGUI_DISABLE_WARN_DYNAMIC_LOAD=1

# Local Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=$DEFAULT_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$DEFAULT_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$DEFAULT_SERVICE_ROLE
EOF
  else
    echo -e "  \033[0;32m✓ $path/.env already exists\033[0m"
  fi
done

# 2. Check Edge Functions environment
EDGE_ENV="$ROOT_DIR/supabase/.env.local"
if [ ! -f "$EDGE_ENV" ]; then
  echo -e "\n\033[0;33mEdge functions require Stripe configuration.\033[0m"
  read -p "Enter STRIPE_SECRET_KEY [sk_test_...]: " STRIPE_SECRET_KEY
  read -p "Enter STRIPE_WEBHOOK_SECRET [whsec_...]: " STRIPE_WEBHOOK_SECRET
  
  cat <<EOF > "$EDGE_ENV"
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-"sk_test_placeholder"}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-"whsec_placeholder"}
# Other provider keys (Mailpit, Tremendous) fall back to mock handlers locally
EOF
  echo -e "  \033[0;32mCreated supabase/.env.local\033[0m"
else
    echo -e "  \033[0;32m✓ supabase/.env.local already exists\033[0m"
fi

echo -e "\n\033[1;32mWorkspace is ready! Run './scripts/release-test.sh' to verify.\033[0m"
