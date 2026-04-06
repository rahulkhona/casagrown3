import { test, describe, beforeEach, afterEach, vi, expect } from 'vitest';
import { fetchAPHIS } from '../sources/aphis.js';
import { HealthLogger } from '../lib/health-logger.js';

describe('APHIS Source fetchAPHIS', () => {
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

  test('successfully extracts state table correctly', async () => {
    const mockHtml = `
      <html>
        <body>
          <main>
            <table>
              <tr><th>State</th><th>County</th></tr>
              <tr><td>California</td><td>Los Angeles County</td></tr>
            </table>
          </main>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockResolvedValue(new Response(mockHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const records = await fetchAPHIS(logger);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].state_code).toBe('CA');
    expect(records[0].county_name).toBe('Los Angeles');
  });

  test('handles restructuring error when no content found', async () => {
     global.fetch = vi.fn().mockResolvedValue(new Response('<html><body><div>No data</div></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const records = await fetchAPHIS(logger);
    expect(records.length).toBe(0);
    expect(logger.hasSchemaDrift()).toBe(true);
  });
});
