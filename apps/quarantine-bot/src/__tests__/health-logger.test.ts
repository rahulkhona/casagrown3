import { describe, it, beforeEach, expect } from 'vitest';
import { HealthLogger } from '../lib/health-logger.js';

describe('HealthLogger', () => {
  let logger: HealthLogger;

  beforeEach(() => {
    logger = new HealthLogger();
  });

  it('initializes seamlessly with 0 records', () => {
    expect(logger.getTotalRecords()).toBe(0);
    expect(logger.hasSchemaDrift()).toBe(false);
    expect(logger.getOverallStatus()).toBe('OK');
  });

  it('flags DEGRADED and schemaDrift when explicitly missing fields are mapped', () => {
    logger.recordSchemaIssue('cdfa_scraper', { severity: 'ERROR', field: 'pest_name', message: 'Missing expected field' });
    logger.recordFetchCount('cdfa_scraper', 100);
    
    expect(logger.hasSchemaDrift()).toBe(true);
    expect(logger.getOverallStatus()).toBe('DEGRADED');
  });

  it('marks OK when fetching proceeds healthfully but has total 0 records without errors', () => {
    // Edge case testing: maybe they removed all quarantines
    logger.recordFetchCount('aphis_api', 0);
    expect(logger.getOverallStatus()).toBe('OK');
    expect(logger.getTotalRecords()).toBe(0);
    expect(logger.hasSchemaDrift()).toBe(false);
  });

  it('escalates to FAILED if strong errors are recorded alongside drift', () => {
    logger.recordError('aphis_api', '500 Internal Server error fetching API');
    logger.recordSchemaIssue('aphis_api', { severity: 'ERROR', field: 'internal', message: 'crash' });
    
    // ERROR sets failed inherently
    expect(logger.getOverallStatus()).toBe('FAILED');
    expect(logger.hasSchemaDrift()).toBe(true); // an ERROR counts as schema drift according to our strict condition
  });
});
