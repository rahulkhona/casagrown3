---
name: test-failure-analysis
description: Exhaustive guidelines for analyzing test failures, strictly requiring line-by-line root-cause extraction and isolated spec verification before launching long-running release test suites.
---

# Test Failure Analysis & Pre-Flight Verification Skill

This skill enforces a strict, zero-assumption workflow for analyzing and resolving test failures. Long-running test suites like `./scripts/release-test.sh` take over 90 minutes to execute. **Never trigger or re-run a long-running test suite until EVERY failure has been individually extracted, root-caused, fixed, and verified in isolation.**

---

## 1. Mandatory Deep Log Extraction & Categorization
When any test suite or test run reports failures:

1. **Extract 100% of Failures**: Never look at only the first 1–2 failures. Search the entire test log output (`grep -i "Error:"`, `grep -i "FAIL"`, or inspect raw logs) and list **every single failing spec file and test case**.
2. **Group by Root Cause Category**: Categorize every failure into its explicit technical category:
   - **Syntax / Build / TypeScript Error** (e.g. missing type definitions, undefined variables)
   - **Playwright Strict Mode Violation** (e.g. `locator('text=...') resolved to 2 elements`)
   - **Locator / Selector Timeout** (e.g. element hidden, dynamic class change, wrong text string)
   - **State / Component Logic Mismatch** (e.g. button disabled prop checking legacy fields)
   - **Dialog / Event Handling** (e.g. `page.once('dialog')` vs `page.on('dialog')`)
   - **Mock / Network Latency** (e.g. unhandled RPC mock, missing API endpoint)

---

## 2. Zero-Assumptions Protocol
- **No Blanket Assumptions**: Never assume that fixing a single high-level build error or global type definition automatically resolves downstream E2E or integration failures.
- **Line-Level Justification**: Every proposed fix MUST be justified by an exact error traceback, exact line number in the test spec, and exact element/component code on disk.

---

## 3. Isolated Pre-Flight Verification (Crucial)
Before running `./scripts/release-test.sh` or any full test suite:

1. **Run Isolated Specs First**: Execute ONLY the specific failing test files or test cases in isolation using single-spec commands (e.g., `npx playwright test path/to/spec.spec.ts` or `npx vitest run path/to/file.test.ts`).
2. **Verify 100% Pass in Isolation**: Ensure that 100% of the targeted failing specs pass cleanly in isolated runs.
3. **Only Then Trigger Full Suite**: Only trigger `./scripts/release-test.sh` after all individual failing specs have been empirically verified in isolation.

---

## 4. Execution Checklist
Before declaring readiness or launching long test suites:
- [ ] Have all failing test log tracebacks been read in full?
- [ ] Have all Playwright locators been checked for strict mode collisions (`.first()`, unique test IDs)?
- [ ] Have all component disabled/enabled conditions been verified against test assertions?
- [ ] Have individual specs been executed and passed in isolation?
- [ ] Is there empirical log evidence of 0 failures in targeted specs?
