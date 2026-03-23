#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# pre-commit.sh — Fast checks before every commit (~30s)
# Runs: TypeScript typecheck + Vitest unit tests
# Usage: ./scripts/pre-commit.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "═══════════════════════════════════════════"
echo "  🔍 PRE-COMMIT CHECKS"
echo "═══════════════════════════════════════════"

# 1. TypeScript — check for compile errors
echo ""
echo "▶ [1/2] TypeScript typecheck (market app)..."
(cd apps/next-market && npx tsc --noEmit --pretty 2>&1) || {
  echo "❌ TypeScript errors found. Fix them before committing."
  exit 1
}
echo "✅ TypeScript OK"

# 2. Vitest — unit tests
echo ""
echo "▶ [2/2] Vitest unit tests..."
(cd apps/next-market && npx vitest run --reporter=verbose 2>&1 | tail -10) || {
  echo "❌ Unit tests failed."
  exit 1
}

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ PRE-COMMIT: ALL CHECKS PASSED"
echo "═══════════════════════════════════════════"
