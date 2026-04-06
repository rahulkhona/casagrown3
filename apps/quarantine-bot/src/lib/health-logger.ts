// ============================================================================
// Health Logger — tracks source health, schema drift, and API reliability
// ============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
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

  // ─── Report Generation ─────────────────────────────────────────────

  /** Generate and write the health report */
  writeReport(outputDir: string): string {
    mkdirSync(outputDir, { recursive: true });
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = join(outputDir, `health_${ts}.log`);

    const lines: string[] = [
      '═══════════════════════════════════════════════════════════════════',
      '  QUARANTINE BOT — HEALTH REPORT',
      `  Run: ${this.runStartedAt.toISOString()} → ${now.toISOString()}`,
      `  Duration: ${now.getTime() - this.runStartedAt.getTime()}ms`,
      '═══════════════════════════════════════════════════════════════════',
      '',
    ];

    // Overall status
    const allSources = Array.from(this.sources.values());
    const failed = allSources.filter((s) => s.status === 'FAILED');
    const degraded = allSources.filter((s) => s.status === 'DEGRADED');
    const ok = allSources.filter((s) => s.status === 'OK');

    lines.push(`OVERALL: ${ok.length} OK, ${degraded.length} DEGRADED, ${failed.length} FAILED`);
    lines.push(`TOTAL RECORDS: ${allSources.reduce((sum, s) => sum + s.records_fetched, 0)}`);
    lines.push('');

    // Per-source detail
    for (const source of allSources) {
      const icon =
        source.status === 'OK' ? '✅' : source.status === 'DEGRADED' ? '⚠️ ' : '❌';
      lines.push(`── ${icon} ${source.source_name} ──`);
      lines.push(`   Status: ${source.status}`);
      lines.push(`   Records: ${source.records_fetched}`);
      lines.push(`   Duration: ${source.duration_ms}ms`);

      if (source.errors.length > 0) {
        lines.push('   Errors:');
        for (const e of source.errors) lines.push(`     ❌ ${e}`);
      }

      if (source.warnings.length > 0) {
        lines.push('   Warnings:');
        for (const w of source.warnings) lines.push(`     ⚠️  ${w}`);
      }

      if (source.schema_issues.length > 0) {
        lines.push('   Schema Issues:');
        for (const si of source.schema_issues) {
          const icon2 =
            si.severity === 'ERROR' ? '🔴' : si.severity === 'WARNING' ? '🟡' : '🔵';
          let line = `     ${icon2} [${si.severity}] ${si.field}: ${si.message}`;
          if (si.expected)
            line += ` (expected: ${si.expected}, got: ${si.actual ?? 'n/a'})`;
          lines.push(line);
        }
      }

      lines.push('');
    }

    // Action items
    const actionItems: string[] = [];
    for (const source of allSources) {
      if (source.status === 'FAILED') {
        actionItems.push(
          `🔴 ${source.source_name}: Source completely failed. Check if the API endpoint has changed or is down.`,
        );
      }
      for (const si of source.schema_issues) {
        if (si.severity === 'ERROR') {
          actionItems.push(
            `🔴 ${source.source_name}: Schema error on field "${si.field}" — code update may be required.`,
          );
        }
      }
      if (source.status === 'DEGRADED' && source.schema_issues.some((s) => s.severity === 'WARNING')) {
        actionItems.push(
          `🟡 ${source.source_name}: Schema warnings detected. Review and update expected schema if API has legitimately changed.`,
        );
      }
    }

    if (actionItems.length > 0) {
      lines.push('═══════════════════════════════════════════════════════════════════');
      lines.push('  ACTION ITEMS — Review these before trusting the CSV output');
      lines.push('═══════════════════════════════════════════════════════════════════');
      for (const item of actionItems) lines.push(`  ${item}`);
      lines.push('');
    }

    const report = lines.join('\n');
    writeFileSync(reportPath, report, 'utf-8');

    // Also print summary to console
    console.log('\n' + lines.slice(0, 8).join('\n'));
    if (actionItems.length > 0) {
      console.log('\n⚠️  ACTION ITEMS:');
      for (const item of actionItems) console.log(`  ${item}`);
    }

    return reportPath;
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

  /** Return the raw log data array for DB persistence */
  getRawLog(): any[] {
    return Array.from(this.sources.values());
  }
}
