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
    const mockSchemaResponse = {
      fields: [
        { name: 'ORGANISM' },
        { name: 'STATUS' },
        { name: 'ACTIVE_DATE' },
        { name: 'END_DATE' },
        { name: 'PROJECT_NAME' }
      ]
    };
    
    const mockApiResponse = {
      fields: [
        { name: 'PEST' },
        { name: 'STATUS' },
        { name: 'EFFECTIVE_DATE' },
        { name: 'END_DATE' },
        { name: 'DESCRIPTION' }
      ],
      features: [
        {
          attributes: {
            PEST: 'Spotted Lanternfly',
            STATUS: 'Active',
            EFFECTIVE_DATE: 1672531200000,
            DESCRIPTION: 'Allegheny County'
          }
        }
      ]
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      // Simulate Florida & Texas being down, PA being healthy
      if (url.includes('Florida') || url.includes('Texas')) {
        return new Response('Not found', { status: 404 });
      }
      
      // For PA (Pennsylvania)
      if (url.includes('f=pjson') && !url.includes('query')) {
         return new Response(JSON.stringify(mockSchemaResponse));
      }
      return new Response(JSON.stringify(mockApiResponse));
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const records = await fetchStateFeeds(logger);
    
    // We mocked PA to return 1 record
    expect(records.length).toBe(1);
    expect(records[0].state_code).toBe('PA');
    expect(records[0].pest_name).toBe('Spotted Lanternfly');
    
    // Check that we got degradation reported for the 2 failed endpoints
    expect(logger.getOverallStatus()).not.toBe('OK');
  });
});
