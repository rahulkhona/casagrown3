import { SupabaseClient } from '@supabase/supabase-js';

export interface ParsedCategory {
  sales_categories: string[];
  produce_categories: string[];
  keywords: string[];
}

// In-memory cache loaded from Supabase at boot
const memoryCache: Record<string, ParsedCategory> = {};
let supabaseClient: SupabaseClient | null = null;

export async function initPestCache(supabase: SupabaseClient) {
  supabaseClient = supabase;
  
  // Load entire cache synchronously to memory for fast lookups
  const { data, error } = await supabase.from('quarantine_pest_categories').select('*');
  if (!error && data) {
    for (const row of data) {
      memoryCache[row.pest_name] = {
        sales_categories: row.sales_categories || [],
        produce_categories: row.produce_categories || [],
        keywords: row.keywords || []
      };
    }
  } else {
    console.warn('⚠️ Failed to load pest cache from Supabase:', error);
  }
}

export function getCachedCategory(pestName: string): ParsedCategory | null {
  return memoryCache[pestName.toLowerCase()] || null;
}

export async function setCachedCategory(pestName: string, parsed: ParsedCategory) {
  const normalized = pestName.toLowerCase();
  
  // Update local memory immediately
  memoryCache[normalized] = parsed;

  if (supabaseClient) {
    // Fire and forget to Supabase
    supabaseClient.from('quarantine_pest_categories').upsert({
      pest_name: normalized,
      sales_categories: parsed.sales_categories,
      produce_categories: parsed.produce_categories,
      keywords: parsed.keywords,
      updated_at: new Date().toISOString()
    }).then(({ error }) => {
      if (error) console.error('Failed to write pest cache to DB', error);
    });
  }
}
