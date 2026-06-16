#!/usr/bin/env bash
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

run_playwright_sequential() {
    local app_name="$1"
    local app_dir="$2"
    local port="$3"
    local use_port_env="$4"
    local test_pattern="${5:-}"

    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  $app_name${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

    echo "  Building and starting $app_name server..."
    local pid=""
    local build_log="scripts/output/build_$(echo "$app_name" | tr '[:upper:]' '[:lower:]').log"
    mkdir -p scripts/output

    if lsof -nP -iTCP:$port -sTCP:LISTEN &>/dev/null; then
      echo "    ⚠️  Evicting stale server on :$port..."
      lsof -Pni :$port | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
      sleep 2
    fi

    rm -rf "$app_dir/.next"
    echo "    Compiling production build (see $build_log)..."
    if ! (cd "$app_dir" && npm run build > "../../$build_log" 2>&1); then
      echo -e "${RED}    ❌ Build failed for $app_name! Check $build_log${NC}"
      cat "$build_log" | tail -20
      return 1
    fi

    if [ "$use_port_env" = "true" ]; then
      (cd "$app_dir" && NODE_OPTIONS='--max-old-space-size=4096' PORT=$port npm run start &>/dev/null) &
    else
      (cd "$app_dir" && NODE_OPTIONS='--max-old-space-size=4096' npm run start &>/dev/null) &
    fi
    pid=$!
    echo "    $app_name → :$port"

    echo "    Waiting for $app_name server..."
    local server_ready=false
    for i in $(seq 1 180); do
      if curl -s "http://localhost:$port" &>/dev/null; then
        server_ready=true
        break
      fi
      sleep 1
    done

    if [ "$server_ready" = "true" ]; then
      echo -e "    ${GREEN}✅ $app_name server ready${NC}"
    else
      echo -e "${RED}    ❌ $app_name server failed to start within 3 minutes.${NC}"
      return 1
    fi

    echo "  Running $app_name Playwright E2E..."
    (cd "$app_dir" && SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" env -u FORCE_COLOR NO_COLOR=1 npx playwright test $test_pattern --reporter=line 2>&1)
    local exit_code=$?

    if [ "$exit_code" -eq 0 ]; then
      echo -e "  ${GREEN}✅ ${app_name} E2E: PASSED${NC}"
    else
      echo -e "  ${RED}❌ ${app_name} E2E: FAILED${NC}"
    fi

    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      lsof -Pni :$port | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
    fi
    echo "  ⏳ Cooling down 10s..."
    sleep 10
}

echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Phase 7: Playwright E2E Tests (Re-run)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"

run_playwright_sequential "Market (mocked)" "apps/next-market" "3001" "true" "e2e/*.spec.ts"
run_playwright_sequential "Market (scenarios)" "apps/next-market" "3001" "true" "e2e/scenarios/"
run_playwright_sequential "Admin" "apps/next-admin" "3003" "true"
run_playwright_sequential "Voice" "apps/next-community-voice" "3002" "true"
run_playwright_sequential "Metrics" "apps/next-metrics" "3004" "true"

echo -e "\n${GREEN}${BOLD}  Phase 7 Re-run Complete!${NC}\n"
