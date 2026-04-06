import { test, describe, beforeEach, afterEach, vi, expect } from 'vitest';
import { fetchCDFA } from '../sources/cdfa.js';
import { HealthLogger } from '../lib/health-logger.js';

describe('CDFA Source fetchCDFA', () => {
  let logger: HealthLogger;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    logger = new HealthLogger();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('successfully parses CDFA features', async () => {
    const mockApiResponse = {
      fields: [{ name: 'FID' }, { name: 'ORGANISM' }, { name: 'PROJECT_NA' }, { name: 'ACTIVE_DAT' }, { name: 'COMPLETED_' }],
      features: [
        {
          attributes: {
            FID: 1,
            ORGANISM: 'HLB',
            PROJECT_NA: '2023 HLB - Los Angeles',
            ACTIVE_DAT: 1672531200000,
            COMPLETED_: null,
          }
        }
      ]
    };
    const mockSchemaResponse = {
      fields: [
        { name: 'FID' },
        { name: 'ORGANISM', domain: { codedValues: [{ code: 'HLB' }] } },
        { name: 'PDR_NUMBER' },
        { name: 'QB_STATUS' },
        { name: 'PROJECT_NA' },
        { name: 'QB_TYPE' },
        { name: 'ACTIVE_DAT' },
        { name: 'COMPLETED_' },
        { name: 'CREATED_DA' },
        { name: 'APPROVED_D' },
        { name: 'SUPERSD_DA' },
        { name: 'SUPERSD_BY' },
        { name: 'ADDITIONAL' },
        { name: 'AREA_SQMI' },
        { name: 'AREA_SQMI_' },
        { name: 'GLOBALID' },
        { name: 'PRIOR' },
      ]
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('f=pjson') && !url.includes('query')) {
         return new Response(JSON.stringify(mockSchemaResponse));
      }
      return new Response(JSON.stringify(mockApiResponse));
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const records = await fetchCDFA(logger);
    expect(records.length).toBe(1);
    expect(records[0].pest_name).toBe('Huanglongbing (Citrus Greening)');
    expect(records[0].county_name).toBe('Los Angeles');
    expect(records[0].state_code).toBe('CA');
  });

  test('handles fetch errors gracefully and logs health issue', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network drop'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const records = await fetchCDFA(logger);
    expect(records.length).toBe(0);
    expect(logger.getOverallStatus()).not.toBe('OK');
  });
});
