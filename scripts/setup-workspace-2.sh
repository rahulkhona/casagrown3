#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CasaGrown — Complete Workspace Setup Script v2
#
# Bootstraps local .env files across all 10 apps, root level, and Supabase
# edge functions for new workspaces and git worktrees, with safe local defaults.
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
DEFAULT_STRIPE_PUBLISHABLE_KEY="pk_test_51T3j6EFG43ORjkf8GLvcYdcBiQtrBLcffUK5vZt7dsiUNjrw4ToV5FDyPEAfAo8hmJcKNghFIcbaKlEeYssogHzY00nc48DMs5"
DEFAULT_GEMINI_KEY=""

# Find parent workspace for credential copying dynamically via git worktree list or fallback candidates
PARENT_DIR=""
if command -v git &>/dev/null; then
  # Find the first worktree in git worktree list that isn't current ROOT_DIR
  while IFS=' ' read -r wt_path _rest; do
    if [ -d "$wt_path" ] && [ "$wt_path" != "$ROOT_DIR" ] && [ -f "$wt_path/.env" ]; then
      PARENT_DIR="$wt_path"
      break
    fi
  done < <(git worktree list 2>/dev/null || true)
fi

# Fallback candidates if git worktree list didn't yield a parent with .env
if [ -z "$PARENT_DIR" ]; then
  for candidate in \
    "$ROOT_DIR/../casagrown-marketing-automation" \
    "$ROOT_DIR/../casagrown3" \
    "$ROOT_DIR/../casagrown" \
    "/Users/rkhona/development/quarantine_bot/casagrown-marketing-automation" \
    "/Users/rkhona/development/quarantine_bot/casagrown3"; do
    if [ -d "$candidate" ] && [ "$candidate" != "$ROOT_DIR" ] && [ -f "$candidate/.env" ]; then
      PARENT_DIR="$candidate"
      break
    fi
  done
fi

# If no parent directory found but encrypted archive exists, unpack it directly
if [ -z "$PARENT_DIR" ] && [ -f "$ROOT_DIR/secrets/local-envs.enc" ]; then
  echo -e "  \033[0;34mNo parent worktree found. Decrypting environment from secrets/local-envs.enc...\033[0m"
  "$ROOT_DIR/scripts/decrypt-envs.sh" || true
fi

echo -e "\033[1;36mBootstrapping CasaGrown Workspace Environment (v2)...\033[0m"
if [ -n "$PARENT_DIR" ]; then
  echo -e "  \033[0;34mFound parent credential workspace at: $PARENT_DIR\033[0m"
fi

# 1. Setup Root .env
ROOT_ENV="$ROOT_DIR/.env"
if [ ! -f "$ROOT_ENV" ]; then
  if [ -n "$PARENT_DIR" ] && [ -f "$PARENT_DIR/.env" ]; then
    echo -e "  \033[0;32m✓ Copying root .env from parent workspace\033[0m"
    cp "$PARENT_DIR/.env" "$ROOT_ENV"
  else
    echo -e "  \033[0;33mCreating root .env with default local values\033[0m"
    cat <<EOF > "$ROOT_ENV"
NEXT_PUBLIC_SUPABASE_URL=$DEFAULT_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$DEFAULT_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$DEFAULT_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=$DEFAULT_SERVICE_ROLE
STRIPE_SECRET_KEY=sk_test_placeholder
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$DEFAULT_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION="true"
NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN="true"
GEMINI_API_KEY=$DEFAULT_GEMINI_KEY
EOF
  fi
else
  echo -e "  \033[0;32m✓ Root .env already exists\033[0m"
fi

# 2. Setup App .env and .env.local files for all 10 apps
for path in "${APPS[@]}"; do
  ENV_FILE="$ROOT_DIR/$path/.env"
  ENV_LOCAL_FILE="$ROOT_DIR/$path/.env.local"
  PARENT_APP_ENV_LOCAL="$PARENT_DIR/$path/.env.local"

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
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$DEFAULT_STRIPE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=$DEFAULT_SERVICE_ROLE
NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION="true"
NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN="true"
EOF
  else
    echo -e "  \033[0;32m✓ $path/.env already exists\033[0m"
  fi

  if [ ! -f "$ENV_LOCAL_FILE" ]; then
    if [ -n "$PARENT_DIR" ] && [ -f "$PARENT_APP_ENV_LOCAL" ]; then
      echo -e "  \033[0;32m✓ Copying $path/.env.local from parent workspace\033[0m"
      cp "$PARENT_APP_ENV_LOCAL" "$ENV_LOCAL_FILE"
    else
      echo -e "  \033[0;33mCreating $path/.env.local with Stripe defaults\033[0m"
      cat <<EOF > "$ENV_LOCAL_FILE"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$DEFAULT_STRIPE_PUBLISHABLE_KEY
EOF
    fi
  else
    echo -e "  \033[0;32m✓ $path/.env.local already exists\033[0m"
  fi

  # For next-admin, ensure GEMINI_API_KEY standard key is set
  if [ "$path" = "apps/next-admin" ]; then
    if ! grep -q "^GEMINI_API_KEY=" "$ENV_LOCAL_FILE" 2>/dev/null; then
      echo "GEMINI_API_KEY=$DEFAULT_GEMINI_KEY" >> "$ENV_LOCAL_FILE"
      echo -e "  \033[0;32m✓ Added standard GEMINI_API_KEY to $path/.env.local\033[0m"
    fi
  fi
done

# 3. Setup Supabase Edge Functions local env
EDGE_ENV="$ROOT_DIR/supabase/.env.local"
if [ ! -f "$EDGE_ENV" ]; then
  if [ -n "$PARENT_DIR" ] && [ -f "$PARENT_DIR/supabase/.env.local" ]; then
    echo -e "  \033[0;32m✓ Copying supabase/.env.local from parent workspace\033[0m"
    cp "$PARENT_DIR/supabase/.env.local" "$EDGE_ENV"
  else
    echo -e "  \033[0;33mCreating supabase/.env.local with placeholder defaults\033[0m"
    cat <<EOF > "$EDGE_ENV"
STRIPE_SECRET_KEY="sk_test_placeholder"
STRIPE_WEBHOOK_SECRET="whsec_placeholder"
KROGER_CLIENT_ID=""
KROGER_CLIENT_SECRET=""
USDA_AMS_API_KEY=""
EOF
  fi
else
  echo -e "  \033[0;32m✓ supabase/.env.local already exists\033[0m"
fi

# 4. Setup supabase/functions/.env
FUNCTIONS_ENV="$ROOT_DIR/supabase/functions/.env"
if [ ! -f "$FUNCTIONS_ENV" ]; then
  if [ -n "$PARENT_DIR" ] && [ -f "$PARENT_DIR/supabase/functions/.env" ]; then
    echo -e "  \033[0;32m✓ Copying supabase/functions/.env from parent workspace\033[0m"
    cp "$PARENT_DIR/supabase/functions/.env" "$FUNCTIONS_ENV"
  fi
else
  echo -e "  \033[0;32m✓ supabase/functions/.env already exists\033[0m"
fi

# 5. Optional auto-installation of dependencies and Playwright browser
if [ "$1" = "--install" ] || [ "$1" = "-i" ]; then
  echo -e "\n\033[1;34mInstalling workspace dependencies (yarn install)...\033[0m"
  yarn install
  echo -e "\n\033[1;34mInstalling Playwright Chromium browser...\033[0m"
  if [ -f "$ROOT_DIR/node_modules/.bin/playwright" ]; then
    "$ROOT_DIR/node_modules/.bin/playwright" install chromium
  fi
fi

echo -e "\n\033[1;32mWorkspace bootstrap complete! Run 'yarn install' and './scripts/release-test.sh' to verify.\033[0m"

