---
name: release-test-report
description: Instructions for parsing and reporting release-test.sh test run progress in a clean tabular format.
---

# Release Test Report Skill

This skill defines how to parse the active `release-test.sh` task output and present the progress in a tabular format.

## Progress Reporting Format

When the user or another process requests test progress, format it as a markdown table with the following columns:

| Phase | Passed | Failed | Skipped | Total | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Phase 0: Prerequisites** | - | - | - | - | PASS / FAIL / RUNNING |
| **Phase 1: Database Setup** | - | - | - | - | PASS / FAIL / RUNNING |
| **Phase 2: Edge Functions** | - | - | - | - | PASS / FAIL / RUNNING |
| **Phase 3: pgTAP Database Tests** | `<Count>` | `<Count>` | - | `<Dynamic>` | PASS / FAIL / RUNNING |
| **Phase 4: Vitest Unit Tests** | `<Count>` | `<Count>` | - | `<Dynamic>` | PASS / FAIL / RUNNING |
| **Phase 4b: Jest Unit Tests** | `<Count>` | `<Count>` | - | `<Dynamic>` | PASS / FAIL / RUNNING |
| **Phase 5: Deno Integration Tests** | `<Count>` | `<Count>` | - | `<Dynamic>` | PASS / FAIL / RUNNING |
| **Phase 6: Shell Integration Tests** | `<Count>` | `<Count>` | - | `<Dynamic>` | PASS / FAIL / RUNNING |
| **Phase 7: Playwright E2E Tests** | `<Count>` | `<Count>` | `<Count>` | `<Dynamic>` | PASS / FAIL / RUNNING |
| **Phase 8: Stress/Load Tests** | `<Count>` | `<Count>` | - | `<Dynamic>` | PASS / FAIL / RUNNING |

## Parsing Guide

1. Read the active task log file or `/Users/rkhona/development/quarantine_bot/casagrown3/scripts/output/release-test-latest.log`.
2. Extract the status of each Phase by matching typical keywords:
   - **Phase 3 (pgTAP)**: Search for `pgTAP: <count> files, <count> tests` or error status.
   - **Phase 4 (Vitest)**: Search for `Market Vitest`, `Admin Vitest`, `Voice Vitest`, `Metrics Vitest`, `Quarantine Bot Vitest` results (e.g. `<count> passed, <count> failed`).
   - **Phase 4b (Jest)**: Search for `expo-market Jest` results.
   - **Phase 5 (Deno)**: Search for `Deno integration tests` results.
   - **Phase 6 (Playwright)**: Search for `playwright` results.
3. Keep reporting the table dynamically on a cron/timer (e.g. every 10 minutes) until the task has finished.

## Dynamic Test Totals Resolution

Do not hardcode test totals. Instead, extract them dynamically from the log file or workspace files as follows:
1. **Phase 3 (pgTAP)**: Sum the `plan(X)` values from all `.sql` files in `supabase/tests/database/` (excluding stress tests), or parse the final logged count.
2. **Phase 4 (Vitest)**: Parse the total tests from the Vitest output (e.g. `1050 passed (1050 total)`).
3. **Phase 4b (Jest)**: Extract from the Jest summary (e.g. `Tests: 35 passed, 35 total`).
4. **Phase 5 (Deno)**: Extract the total from the Deno test runner initialization logs (e.g. `Running 904 tests`).
5. **Phase 6 (Shell)**: Extract the total tests from the shell log output.
6. **Phase 7 (Playwright)**: Extract the planned test counts as each suite starts (e.g., `Running 588 tests using 5 workers`, `Running 391 tests...`). Sum the totals of all launched/completed suites. Mark unlaunched suites as pending or resolve their totals.
7. **Phase 8 (Stress/Load)**: Parse and sum `plan(X)` from all stress test SQL files under `supabase/tests/database/`.
