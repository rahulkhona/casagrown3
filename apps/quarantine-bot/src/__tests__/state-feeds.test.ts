import { test, describe, beforeEach, afterEach, vi, expect } from 'vitest';
import { fetchStateFeeds } from '../sources/state-feeds.js';
import { HealthLogger } from '../lib/health-logger.js';

describe('State Feeds fetchStateFeeds', () => {
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

  test('gracefully skips unreachable endpoints and parses valid ones', async () => {
    // The config has 2 PA endpoints (SLF and TCD), both with presence_only=true
    // and pest_name_override set. The county comes from COUNTY_NAM field.
    
    // Mock schema response (validates endpoint fields)
    const mockSchemaResponse = {
      fields: [
        { name: 'COUNTY_NAM' },
        { name: 'County' },
        { name: 'CreationDate' },
        { name: 'OBJECTID' }
      ]
    };
    
    // Mock query response with features containing COUNTY_NAM
    const mockQueryResponse = {
      features: [
        {
          attributes: {
            COUNTY_NAM: 'Allegheny',
            County: 'Allegheny County',
            CreationDate: 1672531200000,
            OBJECTID: 1
          }
        }
      ],
      exceededTransferLimit: false
    };

    let fetchCallCount = 0;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCallCount++;
      const urlStr = String(url);
      
      // Schema validation calls (contain endpoint URL + ?f=pjson but NOT /query)
      if (urlStr.includes('f=pjson') && !urlStr.includes('/query')) {
        // First PA endpoint (SLF) — succeeds
        if (urlStr.includes('SpottedLanternfly')) {
          return new Response(JSON.stringify(mockSchemaResponse));
        }
        // Second PA endpoint (TCD) — simulate 404 (unreachable)
        if (urlStr.includes('ThousandCankersDisease')) {
          return new Response('Not found', { status: 404 });
        }
        // Fallback for any other schema calls
        return new Response(JSON.stringify(mockSchemaResponse));
      }

      // Query calls (contain /query in path)
      if (urlStr.includes('/query')) {
        return new Response(JSON.stringify(mockQueryResponse));
      }
      
      // Fallback
      return new Response(JSON.stringify(mockSchemaResponse));
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const records = await fetchStateFeeds(logger);
    
    // SLF endpoint should succeed with 1 record, TCD should fail validation
    expect(records.length).toBe(1);
    expect(records[0].state_code).toBe('PA');
    // pest_name_override is 'Spotted Lanternfly' for the SLF config
    expect(records[0].pest_name).toBe('Spotted Lanternfly');
    expect(records[0].county_name).toBe('Allegheny');
    
    // Check that degradation was reported for the failed TCD endpoint
    expect(logger.getOverallStatus()).not.toBe('OK');
  });
});
