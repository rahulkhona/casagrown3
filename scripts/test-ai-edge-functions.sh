#!/usr/bin/env bash
# test-ai-edge-functions.sh — Automated tests for all AI edge functions
# Run with: ./scripts/test-ai-edge-functions.sh
#
# Prerequisites:
#   - Local Supabase running: npx supabase functions serve
#   - GEMINI_API_KEY set in supabase/.env.local or as env var
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_URL="${SUPABASE_URL:-http://localhost:54321}/functions/v1"
ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH}"
PASS=0
FAIL=0
TOTAL=0

# Small 1x1 red pixel as base64 JPEG for photo tests
TEST_IMAGE="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

run_test() {
  local name="$1"
  local endpoint="$2"
  local payload="$3"
  local max_time_ms="$4"
  local jq_validate="$5"

  TOTAL=$((TOTAL + 1))

  local start_ms
  start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')

  local http_code body
  body=$(curl -s -w '\n%{http_code}' -X POST "${BASE_URL}/${endpoint}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "apikey: ${ANON_KEY}" \
    -d "${payload}" \
    --max-time $((max_time_ms / 1000 + 5)) 2>/dev/null || echo -e "\nCURL_TIMEOUT")

  local end_ms
  end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  local elapsed_ms=$((end_ms - start_ms))
  local elapsed_s
  elapsed_s=$(python3 -c "print(f'{${elapsed_ms}/1000:.1f}s')")

  # Split body and http_code
  http_code=$(echo "$body" | tail -1)
  body=$(echo "$body" | sed '$d')

  # Check for curl timeout
  if [ "$http_code" = "CURL_TIMEOUT" ]; then
    echo -e "  ${RED}❌ ${name}${NC}  ${elapsed_s}  FAIL (curl timeout)"
    FAIL=$((FAIL + 1))
    return
  fi

  # Check HTTP status
  if [ "$http_code" != "200" ]; then
    echo -e "  ${RED}❌ ${name}${NC}  ${elapsed_s}  FAIL (HTTP ${http_code})"
    echo "     Response: $(echo "$body" | head -c 200)"
    FAIL=$((FAIL + 1))
    return
  fi

  # Check latency
  if [ "$elapsed_ms" -gt "$max_time_ms" ]; then
    echo -e "  ${RED}❌ ${name}${NC}  ${elapsed_s}  FAIL (too slow, max ${max_time_ms}ms)"
    FAIL=$((FAIL + 1))
    return
  fi

  # Validate JSON schema with jq
  local valid
  valid=$(echo "$body" | jq -r "${jq_validate}" 2>/dev/null || echo "INVALID")
  if [ "$valid" = "INVALID" ] || [ "$valid" = "false" ] || [ "$valid" = "null" ]; then
    echo -e "  ${RED}❌ ${name}${NC}  ${elapsed_s}  FAIL (JSON validation failed)"
    echo "     Response: $(echo "$body" | head -c 300)"
    FAIL=$((FAIL + 1))
    return
  fi

  echo -e "  ${GREEN}✅ ${name}${NC}  ${elapsed_s}  PASS"
  PASS=$((PASS + 1))
}

run_model_test() {
  local model="$1"
  local test_type="$2"
  local payload="$3"
  local max_time_ms="$4"

  TOTAL=$((TOTAL + 1))

  local api_url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  local api_key="${GEMINI_API_KEY:-}"

  # Try to load from supabase/.env.local if not set
  if [ -z "$api_key" ]; then
    api_key=$(grep -v '^#' "${SCRIPT_DIR}/../supabase/.env.local" 2>/dev/null | grep 'GEMINI_API_KEY=' | tail -1 | cut -d= -f2)
  fi

  if [ -z "$api_key" ]; then
    echo -e "  ${YELLOW}⚠️  ${model} ${test_type}${NC}  SKIP (no GEMINI_API_KEY)"
    return
  fi

  local start_ms
  start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')

  local body
  body=$(curl -s -X POST "${api_url}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${api_key}" \
    -d "${payload}" \
    --max-time $((max_time_ms / 1000 + 5)) 2>/dev/null || echo "CURL_TIMEOUT")

  local end_ms
  end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  local elapsed_ms=$((end_ms - start_ms))
  local elapsed_s
  elapsed_s=$(python3 -c "print(f'{${elapsed_ms}/1000:.1f}s')")

  if [ "$body" = "CURL_TIMEOUT" ]; then
    echo -e "  ${RED}❌ ${model}  ${test_type}${NC}  ${elapsed_s}  FAIL (timeout)"
    FAIL=$((FAIL + 1))
    return
  fi

  # Check if response has choices
  local content
  content=$(echo "$body" | jq -r '.choices[0].message.content // empty' 2>/dev/null)

  if [ -z "$content" ]; then
    local error_msg
    error_msg=$(echo "$body" | jq -r '.error.message // .error // empty' 2>/dev/null)
    echo -e "  ${RED}❌ ${model}  ${test_type}${NC}  ${elapsed_s}  FAIL (no content: ${error_msg:-unknown})"
    FAIL=$((FAIL + 1))
    return
  fi

  # Try to extract JSON from the content (simulating cleanJsonText)
  local cleaned
  cleaned=$(echo "$content" | sed 's/<thought>.*<\/thought>//g' | sed 's/^```json//;s/^```//;s/```$//' | grep -o '{.*}' | head -1)

  if [ -z "$cleaned" ]; then
    echo -e "  ${RED}❌ ${model}  ${test_type}${NC}  ${elapsed_s}  FAIL (no JSON in response)"
    echo "     Raw: $(echo "$content" | head -c 200)"
    FAIL=$((FAIL + 1))
    return
  fi

  # Validate it's parseable JSON
  if ! echo "$cleaned" | jq empty 2>/dev/null; then
    echo -e "  ${RED}❌ ${model}  ${test_type}${NC}  ${elapsed_s}  FAIL (invalid JSON)"
    echo "     Cleaned: $(echo "$cleaned" | head -c 200)"
    FAIL=$((FAIL + 1))
    return
  fi

  if [ "$elapsed_ms" -gt "$max_time_ms" ]; then
    echo -e "  ${YELLOW}⚠️  ${model}  ${test_type}${NC}  ${elapsed_s}  SLOW (over ${max_time_ms}ms but valid)"
    PASS=$((PASS + 1))
    return
  fi

  echo -e "  ${GREEN}✅ ${model}  ${test_type}${NC}  ${elapsed_s}  PASS"
  PASS=$((PASS + 1))
}

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  AI Edge Function Test Suite${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# ═══════════════════════════════════════════════════════
# LAYER 1: Per-Model Smoke Tests
# ═══════════════════════════════════════════════════════
echo -e "${YELLOW}=== Layer 1: Per-Model Smoke Tests ===${NC}"
echo ""

TEXT_PROMPT='Suggest a fair price for homegrown tomatoes sold to neighbors. Respond ONLY with JSON: {"price_usd": <number>, "unit": "<string>"}'

PHOTO_PROMPT='What produce is shown in this photo? Respond ONLY with JSON: {"name": "<string>", "category": "<string>"}'

for MODEL in "gemini-3.5-flash-lite" "gemini-3.5-flash" "gemma-4-31b-it"; do
  # Text → JSON test
  run_model_test "$MODEL" "text→JSON" \
    "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"${TEXT_PROMPT}\"}],\"max_tokens\":100,\"temperature\":0.3}" \
    15000

  # Photo → JSON test (multimodal)
  run_model_test "$MODEL" "photo→JSON" \
    "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"image_url\",\"image_url\":{\"url\":\"${TEST_IMAGE}\"}},{\"type\":\"text\",\"text\":\"${PHOTO_PROMPT}\"}]}],\"max_tokens\":200,\"temperature\":0.3}" \
    20000

  # response_format test
  run_model_test "$MODEL" "json_mode" \
    "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"${TEXT_PROMPT}\"}],\"max_tokens\":100,\"temperature\":0.3,\"response_format\":{\"type\":\"json_object\"}}" \
    15000
done

echo ""

# ═══════════════════════════════════════════════════════
# LAYER 2: Edge Function Integration Tests
# ═══════════════════════════════════════════════════════
echo -e "${YELLOW}=== Layer 2: Edge Function Integration Tests ===${NC}"
echo ""

# Test 1: suggest-product-price
run_test "suggest-product-price" \
  "suggest-product-price" \
  '{"name":"Heirloom Tomatoes","state":"CA","city":"San Jose"}' \
  8000 \
  'if (.price_usd != null and .unit != null) then "ok" else "false" end'

# Test 2: analyze-product-photo (text only)
run_test "analyze-product-photo (text)" \
  "analyze-product-photo" \
  '{"text":"I have fresh organic meyer lemons from my backyard tree, about 20 of them ready to sell"}' \
  10000 \
  'if (.name != null and .category != null) then "ok" else "false" end'

# Test 3: analyze-product-photo (photo)
run_test "analyze-product-photo (photo)" \
  "analyze-product-photo" \
  "{\"image\":\"${TEST_IMAGE}\"}" \
  15000 \
  'if (.name != null and .category != null) then "ok" else "false" end'

# Test 4: casabot-recipe-suggestions
run_test "casabot-recipe-suggestions" \
  "casabot-recipe-suggestions" \
  '{"name":"Meyer Lemons","description":"Fresh from my backyard tree","category":"Citrus"}' \
  8000 \
  'if (.intro != null and (.recipes | length) > 0) then "ok" else "false" end'

# Test 5: moderate-listing (background, higher timeout)
run_test "moderate-listing" \
  "moderate-listing" \
  '{"product_id":"test-123","name":"Fresh Organic Tomatoes","description":"Grown in my backyard","price_usd":5.00,"category":"Produce"}' \
  35000 \
  'if (.status != null) then "ok" else "false" end'

# Test 6: estimate-earnings (new email to avoid cache)
RANDOM_EMAIL="test_$(date +%s)@example.com"
run_test "estimate-earnings (new)" \
  "estimate-earnings" \
  "{\"zipcode\":\"95120\",\"size\":\"Medium Backyard\",\"plants\":[\"Tomatoes (x2)\"],\"trees\":[\"Lemons (x1)\"],\"lead\":{\"name\":\"Test User\",\"email\":\"${RANDOM_EMAIL}\",\"marketingConsent\":true}}" \
  8000 \
  'if (.ai_estimate_result.estimated_annual_earnings != null) then "ok" else "false" end'

# Test 7: estimate-earnings (cached — same email, should be fast)
run_test "estimate-earnings (cached)" \
  "estimate-earnings" \
  "{\"zipcode\":\"95120\",\"size\":\"Medium Backyard\",\"plants\":[\"Tomatoes (x2)\"],\"trees\":[\"Lemons (x1)\"],\"lead\":{\"name\":\"Test User\",\"email\":\"${RANDOM_EMAIL}\",\"marketingConsent\":true}}" \
  3000 \
  'if (.ai_estimate_result.estimated_annual_earnings != null) then "ok" else "false" end'

# Test 8: estimate-nutrition-loss
RANDOM_EMAIL2="test_nutr_$(date +%s)@example.com"
run_test "estimate-nutrition-loss" \
  "estimate-nutrition-loss" \
  "{\"produce\":[\"Tomatoes\",\"Spinach\"],\"lead\":{\"name\":\"Test User\",\"email\":\"${RANDOM_EMAIL2}\",\"marketingConsent\":true}}" \
  8000 \
  'if (.ai_nutrition_result.items != null and (.ai_nutrition_result.items | length) > 0) then "ok" else "false" end'

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${TOTAL} total"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
echo -e "${GREEN}All tests passed!${NC}"
