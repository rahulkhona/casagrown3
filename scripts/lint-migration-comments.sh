#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# lint-migration-comments.sh — Checks that SQL migrations include
# proper COMMENT ON statements for new tables and columns.
#
# Enforces the schema documentation rules from .agents/AGENTS.md:
#   1. Every CREATE TABLE must have a COMMENT ON TABLE
#   2. Every ADD COLUMN must have a COMMENT ON COLUMN
#   3. Every JSONB column must document its key structure
#
# Usage:
#   ./scripts/lint-migration-comments.sh                    # lint all migrations
#   ./scripts/lint-migration-comments.sh --staged           # lint only staged files
#   ./scripts/lint-migration-comments.sh path/to/file.sql   # lint specific file
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

errors=0
warnings=0

# Determine which files to lint
if [[ "${1:-}" == "--staged" ]]; then
  files=$(git diff --cached --name-only --diff-filter=ACM -- 'supabase/migrations/*.sql' 2>/dev/null || true)
elif [[ -n "${1:-}" && -f "${1:-}" ]]; then
  files="$1"
else
  files=$(find supabase/migrations -name '*.sql' -type f 2>/dev/null | sort)
fi

if [[ -z "$files" ]]; then
  echo -e "${GREEN}✅ No migration files to lint.${NC}"
  exit 0
fi

echo "🔍 Linting migration files for schema documentation..."
echo ""

for file in $files; do
  basename=$(basename "$file")
  file_errors=0

  # ── Check 1: CREATE TABLE must have COMMENT ON TABLE ──────────────
  # Extract table names from CREATE TABLE [IF NOT EXISTS] [public.]<name>
  tables=$(grep -iE '^[[:space:]]*(CREATE[[:space:]]+TABLE)' "$file" 2>/dev/null | \
    sed -E 's/.*CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?//' | \
    sed -E 's/^(public\.)?//' | \
    sed -E 's/[[:space:]]*\(.*//' | \
    sed -E 's/[[:space:]]+$//' | \
    sed 's/"//g' | \
    tr '[:upper:]' '[:lower:]' | \
    grep -vE '^(create|table|if|not|exists|public)$' | \
    grep -v '^$' | \
    sort -u || true)

  for table in $tables; do
    # Check if there's a COMMENT ON TABLE for this table in the same file
    if ! grep -qi "COMMENT ON TABLE[[:space:]].*${table}" "$file" 2>/dev/null; then
      echo -e "${RED}ERROR${NC} [$basename]: CREATE TABLE ${table} — missing COMMENT ON TABLE"
      echo "  Add: COMMENT ON TABLE ${table} IS '<description>';"
      echo "  For non-market tables, prefix with @audience:no"
      ((file_errors++)) || true
    fi
  done

  # ── Check 2: ADD COLUMN must have COMMENT ON COLUMN ───────────────
  # Extract table.column pairs from ALTER TABLE ... ADD COLUMN ...
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # Extract table name and column name
    table=$(echo "$line" | sed -E 's/.*ALTER[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?(public\.)?//' | \
      sed -E 's/[[:space:]]+ADD[[:space:]]+COLUMN.*//' | sed 's/"//g' | tr '[:upper:]' '[:lower:]')
    col=$(echo "$line" | sed -E 's/.*ADD[[:space:]]+COLUMN[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?//' | \
      sed -E 's/[[:space:]]+.*//' | sed 's/"//g' | tr '[:upper:]' '[:lower:]')

    if [[ -n "$table" && -n "$col" ]]; then
      if ! grep -qi "COMMENT ON COLUMN[[:space:]].*${table}\.${col}" "$file" 2>/dev/null; then
        echo -e "${YELLOW}WARNING${NC} [$basename]: ADD COLUMN ${table}.${col} — missing COMMENT ON COLUMN"
        echo "  Add: COMMENT ON COLUMN ${table}.${col} IS '<description>';"
        ((warnings++)) || true
      fi
    fi
  done < <(grep -iE 'ALTER[[:space:]]+TABLE.*ADD[[:space:]]+COLUMN' "$file" 2>/dev/null || true)

  # ── Check 3: JSONB columns should document key structure ──────────
  # Find lines with JSONB type declarations (in CREATE TABLE or ADD COLUMN)
  # Only match actual column definitions, not COMMENT ON or function bodies
  jsonb_cols=$(grep -iE '^[[:space:]]+[a-z_]+[[:space:]]+jsonb' "$file" 2>/dev/null | \
    grep -vi 'COMMENT ON' | \
    grep -vi 'RETURNS' | \
    grep -vi '^\-\-' | \
    sed -E 's/^[[:space:]]*//' | \
    sed -E 's/[[:space:]]+jsonb.*//' | \
    sed 's/"//g' | \
    grep -v '^$' || true)

  for col in $jsonb_cols; do
    col_lower=$(echo "$col" | tr '[:upper:]' '[:lower:]')
    # Check if there's a comment that mentions JSONB/JSON structure
    if grep -qi "COMMENT ON COLUMN.*\.${col_lower}" "$file" 2>/dev/null; then
      comment_text=$(grep -i "COMMENT ON COLUMN.*\.${col_lower}" "$file" | head -1)
      if ! echo "$comment_text" | grep -qiE "jsonb|json|\{.*:|\[.*\]|structure|keys|schema|object|array"; then
        echo -e "${YELLOW}WARNING${NC} [$basename]: JSONB column ${col_lower} — comment doesn't document key structure"
        echo "  Update to describe JSONB keys, types, and query examples"
        ((warnings++)) || true
      fi
    fi
  done

  ((errors += file_errors)) || true
done

echo ""
if [[ $errors -gt 0 ]]; then
  echo -e "${RED}═══════════════════════════════════════════${NC}"
  echo -e "${RED}  ❌ FAILED: ${errors} error(s), ${warnings} warning(s)${NC}"
  echo -e "${RED}═══════════════════════════════════════════${NC}"
  echo ""
  echo "Every CREATE TABLE needs a COMMENT ON TABLE."
  echo "See .agents/AGENTS.md → Schema Documentation Rules"
  exit 1
elif [[ $warnings -gt 0 ]]; then
  echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  ⚠️  PASSED with ${warnings} warning(s)${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
  exit 0
else
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ All migration files properly documented${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  exit 0
fi
