// ============================================================================
// Health Logger — tracks source health, schema drift, and API reliability
// ============================================================================

import type { SourceHealth, SchemaIssue } from '../types.js';

/** Accumulates health data across all sources for a single run */
export class HealthLogger {
  private sources: Map<string, SourceHealth> = new Map();
  private runStartedAt: Date;

  constructor() {
    this.runStartedAt = new Date();
  }

  /** Initialize tracking for a source */
  startSource(name: string): void {
    this.sources.set(name, {
      source_name: name,
      status: 'OK',
      records_fetched: 0,
      duration_ms: 0,
      errors: [],
      warnings: [],
      schema_issues: [],
    });
  }

  /** Get the health record for a source */
  private getSource(name: string): SourceHealth {
    let s = this.sources.get(name);
    if (!s) {
      this.startSource(name);
      s = this.sources.get(name)!;
    }
    return s;
  }

  /** Record a fatal error — source is FAILED */
  recordError(source: string, message: string): void {
    const s = this.getSource(source);
    s.status = 'FAILED';
    s.errors.push(message);
    console.error(`  ❌ [${source}] ERROR: ${message}`);
  }

  /** Record a non-fatal warning — source is DEGRADED */
  recordWarning(source: string, message: string): void {
    const s = this.getSource(source);
    if (s.status === 'OK') s.status = 'DEGRADED';
    s.warnings.push(message);
    console.warn(`  ⚠️  [${source}] WARNING: ${message}`);
  }

  /** Record a schema issue (missing field, unexpected type, new field, etc.) */
  recordSchemaIssue(source: string, issue: SchemaIssue): void {
    const s = this.getSource(source);
    s.schema_issues.push(issue);

    if (issue.severity === 'ERROR') {
      if (s.status !== 'FAILED') s.status = 'DEGRADED';
      console.error(
        `  🔴 [${source}] SCHEMA ${issue.severity}: ${issue.field} — ${issue.message}` +
          (issue.expected ? ` (expected: ${issue.expected}, got: ${issue.actual ?? 'missing'})` : ''),
      );
    } else {
      console.warn(
        `  🟡 [${source}] SCHEMA ${issue.severity}: ${issue.field} — ${issue.message}` +
          (issue.expected ? ` (expected: ${issue.expected}, got: ${issue.actual ?? 'n/a'})` : ''),
      );
    }
  }

  /** Record successful fetch count */
  recordFetchCount(source: string, count: number): void {
    this.getSource(source).records_fetched = count;
  }

  /** Record duration */
  recordDuration(source: string, ms: number): void {
    this.getSource(source).duration_ms = ms;
  }

  /** Mark source as OK with final stats */
  finishSource(source: string, recordCount: number, durationMs: number): void {
    const s = this.getSource(source);
    s.records_fetched = recordCount;
    s.duration_ms = durationMs;
  }

  // ─── Schema Validation Helpers ─────────────────────────────────────

  /**
   * Validates that an ArcGIS response has the expected fields.
   * Flags missing fields as ERROR, unexpected new fields as INFO.
   */
  validateArcGISFields(
    source: string,
    actualFields: string[],
    expectedFields: string[],
  ): void {
    const actualSet = new Set(actualFields.map((f) => f.toUpperCase()));
    const expectedSet = new Set(expectedFields.map((f) => f.toUpperCase()));

    // Missing expected fields → ERROR
    for (const field of expectedSet) {
      if (!actualSet.has(field)) {
        this.recordSchemaIssue(source, {
          severity: 'ERROR',
          field,
          message: `Expected field "${field}" is MISSING from API response. The API schema may have changed.`,
          expected: 'present',
          actual: 'missing',
        });
      }
    }

    // New unexpected fields → INFO (not an error, but worth tracking)
    for (const field of actualSet) {
      if (!expectedSet.has(field)) {
        this.recordSchemaIssue(source, {
          severity: 'INFO',
          field,
          message: `New field "${field}" detected in API response — not in expected schema.`,
        });
      }
    }
  }

  /**
   * Checks that a coded-value domain (enum) has the expected values.
   * Flags missing codes as WARNING, new codes as INFO.
   */
  validateCodedDomain(
    source: string,
    fieldName: string,
    actualCodes: string[],
    expectedCodes: string[],
  ): void {
    const actualSet = new Set(actualCodes);
    const expectedSet = new Set(expectedCodes);

    for (const code of expectedSet) {
      if (!actualSet.has(code)) {
        this.recordSchemaIssue(source, {
          severity: 'WARNING',
          field: fieldName,
          message: `Expected coded value "${code}" is missing from domain.`,
          expected: code,
          actual: 'missing',
        });
      }
    }

    for (const code of actualSet) {
      if (!expectedSet.has(code)) {
        this.recordSchemaIssue(source, {
          severity: 'INFO',
          field: fieldName,
          message: `New coded value "${code}" appeared in domain — may indicate new pest type.`,
        });
      }
    }
  }

  /**
   * Validates that the HTTP response structure is what we expect
   * (e.g. has "features" array, "fields" array, etc.)
   */
  validateResponseStructure(
    source: string,
    response: Record<string, unknown>,
    requiredKeys: string[],
  ): boolean {
    let valid = true;
    for (const key of requiredKeys) {
      if (!(key in response)) {
        this.recordSchemaIssue(source, {
          severity: 'ERROR',
          field: key,
          message: `Response is missing top-level key "${key}". API structure may have changed.`,
          expected: 'present',
          actual: 'missing',
        });
        valid = false;
      }
    }
    return valid;
  }

  // ─── Anomaly Detection ─────────────────────────────────────────────

  /**
   * Checks if the record count is within expected bounds.
   * Too few records may indicate the API is filtering differently.
   * Too many may indicate the query is no longer scoped correctly.
   */
  validateRecordCount(
    source: string,
    actual: number,
    expectedMin: number,
    expectedMax: number,
  ): void {
    if (actual === 0) {
      this.recordSchemaIssue(source, {
        severity: 'ERROR',
        field: 'record_count',
        message: `Zero records returned. API may be down, query may be broken, or data was removed.`,
        expected: `${expectedMin}–${expectedMax}`,
        actual: '0',
      });
    } else if (actual < expectedMin) {
      this.recordSchemaIssue(source, {
        severity: 'WARNING',
        field: 'record_count',
        message: `Fewer records than expected (${actual} < ${expectedMin}). Data may have been removed or query changed.`,
        expected: `${expectedMin}–${expectedMax}`,
        actual: String(actual),
      });
    } else if (actual > expectedMax) {
      this.recordSchemaIssue(source, {
        severity: 'WARNING',
        field: 'record_count',
        message: `More records than expected (${actual} > ${expectedMax}). Query scope may have widened.`,
        expected: `${expectedMin}–${expectedMax}`,
        actual: String(actual),
      });
    }
  }

  /** Get the overall status */
  getOverallStatus(): 'OK' | 'DEGRADED' | 'FAILED' {
    const allSources = Array.from(this.sources.values());
    if (allSources.some((s) => s.status === 'FAILED')) return 'FAILED';
    if (allSources.some((s) => s.status === 'DEGRADED')) return 'DEGRADED';
    return 'OK';
  }

  /** Get total records across all sources */
  getTotalRecords(): number {
    return Array.from(this.sources.values()).reduce(
      (sum, s) => sum + s.records_fetched,
      0,
    );
  }

  /** Check if any source triggered a schema drift issue */
  hasSchemaDrift(): boolean {
    const allSources = Array.from(this.sources.values());
    return allSources.some(s => s.schema_issues.some(issue => issue.severity === 'ERROR' || issue.severity === 'WARNING'));
  }

  /**
   * Returns a compact error log of all non-OK sources for DB persistence.
   * Only includes sources with errors, warnings, or schema issues (ERROR/WARNING severity).
   * Omits INFO-level schema issues to keep the log focused on actionable problems.
   */
  getErrorLog(): Record<string, unknown> | null {
    const log: Record<string, unknown> = {};
    for (const [name, source] of this.sources.entries()) {
      const actionableIssues = source.schema_issues.filter(
        (i) => i.severity === 'ERROR' || i.severity === 'WARNING',
      );
      if (source.status !== 'OK' || source.errors.length > 0 || source.warnings.length > 0 || actionableIssues.length > 0) {
        log[name] = {
          status: source.status,
          records_fetched: source.records_fetched,
          errors: source.errors,
          warnings: source.warnings,
          schema_issues: actionableIssues.map((i) => ({
            severity: i.severity,
            field: i.field,
            message: i.message,
            ...(i.expected ? { expected: i.expected, actual: i.actual } : {}),
          })),
        };
      }
    }
    return Object.keys(log).length > 0 ? log : null;
  }
}
