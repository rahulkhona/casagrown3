---
name: code-review
description: Exhaustive pre-commit code review guidelines, strictly enforcing no code duplication, high-quality test coverage (>90%) with thorough Playwright UX navigation, and zero-tolerance for CPU/Memory/IO/Latency/Deadlock wastes.
---

# Code Review Skill

This skill outlines the strict guidelines and verification checklist to perform before submitting or committing code. Every change MUST undergo this review process.

## 1. Exhaustive Codebase & Dependency Analysis
- **Impact Scan**: Exhaustively search the codebase to identify all files, APIs, hooks, types, and DB functions that consume or interact with the modified code.
- **No Duplication**: Verify that the new functionality does not duplicate helper utilities, components, SQL schemas, or CSS classes. DRY (Don't Repeat Yourself) is strictly enforced.
- **Performance & Resource Optimization**: Ensure the code does not waste CPU or Memory, and strictly avoids I/O wastes, latency bottlenecks, and deadlocks:
  - Avoid redundant queries or API fetches (fix N+1 DB bottlenecks).
  - Use in-memory batching and computation where possible instead of multiple network calls.
  - Keep database queries indexed and optimized.
  - Guard against concurrency deadlocks and race conditions.
  - Optimize memory usage (e.g., avoid keeping huge datasets in React state).

## 2. Metrics & Analytics Integrity (Bot Filtering)
- When adding or modifying tracking, analytics, page visits, or page events, **always** ensure that bot visitors are properly flagged (`is_bot = true`) and excluded from all metrics reports, dashboards, funnels, and wizard analytics.
- Redefine all relevant PostgreSQL views or RPC functions (`metrics_crm_...`, `metrics_wizard_...`) to filter out bot visits (`is_bot = false`).

## 3. Strict Test Coverage Requirements
- **Test Coverage (>90%)**: Every modified or new file must achieve at least **90% test coverage**.
- **Field Validation**: Test files must verify all input fields, checking both happy paths and edge cases (e.g. empty strings, invalid formats, validation error banners).
- **Realistic Seed Data**: Seed data must be populated with realistic scenarios, realistic timestamps, and mock values so we test production-like behavior.
- **Thorough Playwright E2E Tests**: Playwright tests must rigorously simulate real user navigation, complex UI interactions, transitions between wizard steps, auth redirections, and page unloads. Test the entire user experience from start to finish.
- **Mocking**: Mock external APIs (like Gemini, Stripe, Twilio) cleanly, with custom mock assertions to verify they are invoked with the correct payloads.

## 4. Pre-Commit Verification Checklist
Before committing:
1. Run local TypeScript/Next build checks: `npx tsc --noEmit` or `npm run build`.
2. Run database migrations and resets: `supabase db reset`.
3. Run the full release readiness suite: `./scripts/release-test.sh`.
