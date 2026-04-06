import { describe, it, expect } from 'vitest';
import { normalize, deduplicate } from '../normalizer.js';
import type { RawQuarantineRecord } from '../../types.js';

describe('normalizer', () => {
  it('extracts produce correctly and normalsizes raw record', async () => {
    const raw: RawQuarantineRecord = {
      notes: 'some text about spotted lanternfly and hlb',
      pest_name: 'test_pest',
      state_code: 'CA',
      state_name: 'California',
      county_name: 'Los Angeles',
      source_url: 'http://test',
      is_active: true,
      data_source: 'TEST',
      confidence: 'HIGH'
    };
    
    const row = await normalize(raw);
    
    expect(row.state_code).toBe('CA');
    expect(row.county_name).toBe('Los Angeles');
    expect(row.notes).toBe(raw.notes);
    expect(row.is_active).toBe('true');
    expect(row.category).toBe('produce');
    // 'hlb' -> citrus, 'spotted lanternfly' -> grapes
    expect(row.produce_category.includes('citrus')).toBeTruthy();
    expect(row.produce_category.includes('grapes')).toBeTruthy();
  });

  it('deduplicates properly keeping the newest', async () => {
    const row1 = await normalize({
      notes: 'apple moth',
      pest_name: 'apple moth',
      state_code: 'CA',
      state_name: 'California',
      county_name: 'SF',
      source_url: 'http://test1',
      is_active: true,
      data_source: 'T1',
      confidence: 'LOW',
      starts_at: new Date('2023-01-01')
    });

    const row2 = await normalize({
      notes: 'apple moth',
      pest_name: 'apple moth',
      state_code: 'CA',
      state_name: 'California',
      county_name: 'SF',
      source_url: 'http://test2',
      is_active: true,
      data_source: 'T2',
      confidence: 'HIGH',
      starts_at: new Date('2023-01-02')
    });

    const deduped = deduplicate([row1, row2]);
    expect(deduped.length).toBe(1);
    expect(deduped[0].confidence).toBe('HIGH');
  });
});
