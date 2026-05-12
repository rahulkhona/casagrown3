import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Source interfaces ───────────────────────────────────────────────

interface ShoppingResult {
  name: string;
  price?: string;
  seller?: string;
  location?: string;
  distance?: string;
  url?: string;
  source: 'casagrown' | 'usda' | 'ofn' | 'google_places';
  source_label: string;
}

interface SearchPayload {
  search_items: string[];
  category?: string;
  prefer_local?: boolean;
  user_id?: string;
  zip_code?: string;
  lat?: number;
  lng?: number;
}

// ─── 1. CasaGrown marketplace search (always first) ─────────────────

async function searchCasaGrown(
  supabase: any,
  items: string[]
): Promise<ShoppingResult[]> {
  const results: ShoppingResult[] = [];
  
  for (const item of items) {
    const keyword = item.toLowerCase().trim();
    
    // Use full-text search if available, fallback to ILIKE
    const { data: products } = await supabase
      .from('market_products')
      .select('name, price_usd, description, profiles!market_products_seller_id_fkey(full_name, city, state_code)')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .or(`name.ilike.%${keyword}%,description.ilike.%${keyword}%`)
      .limit(5);

    if (products && products.length > 0) {
      for (const p of products) {
        results.push({
          name: p.name,
          price: p.price_usd ? `$${Number(p.price_usd).toFixed(2)}` : undefined,
          seller: p.profiles?.full_name || 'CasaGrown Seller',
          location: [p.profiles?.city, p.profiles?.state_code].filter(Boolean).join(', ') || undefined,
          source: 'casagrown',
          source_label: '🏡 From your neighbors',
        });
      }
    }
  }
  return results;
}

// ─── 2. Open Food Network (local food hubs & shops) ─────────────────

async function searchOFN(
  items: string[]
): Promise<ShoppingResult[]> {
  const apiToken = Deno.env.get('OFN_API_TOKEN');
  const ofnBaseUrl = Deno.env.get('OFN_BASE_URL') || 'https://openfoodnetwork.net';
  if (!apiToken) {
    console.log('[Shopping] OFN skipped — no API token');
    return [];
  }

  const results: ShoppingResult[] = [];

  try {
    // OFN v1: list enterprises (shops/producers)
    const resp = await fetch(`${ofnBaseUrl}/api/v1/enterprises?token=${apiToken}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const enterprises = data?.enterprises || data?.data || [];
      
      // Show shops that are likely to carry produce/plants
      for (const ent of enterprises.slice(0, 5)) {
        results.push({
          name: ent.name || 'Local Food Hub',
          seller: ent.description ? ent.description.slice(0, 60) + '...' : undefined,
          location: [ent.address?.city, ent.address?.state].filter(Boolean).join(', '),
          url: ent.permalink ? `${ofnBaseUrl}${ent.permalink}` : undefined,
          source: 'ofn',
          source_label: '🥕 Local food network',
        });
      }
    } else {
      console.warn(`[Shopping] OFN API returned ${resp.status}`);
    }
  } catch (e: any) {
    console.warn('[Shopping] OFN API error:', e.message);
  }

  return results;
}

// ─── 3. USDA Local Food Directory (farmers markets fallback) ────────

async function searchUSDA(
  zip: string,
  radius: number = 25
): Promise<ShoppingResult[]> {
  const apiKey = Deno.env.get('USDA_LOCAL_FOOD_API_KEY');
  if (!apiKey) {
    console.log('[Shopping] USDA skipped — no API key');
    return [];
  }

  const results: ShoppingResult[] = [];

  try {
    const url = `https://www.usdalocalfoodportal.com/mywp/wp-json/frontend/data_share?directory=farmersmarket&zip=${zip}&radius=${radius}&apikey=${apiKey}`;
    console.log(`[Shopping] USDA query: zip=${zip}, radius=${radius}mi`);
    
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    
    if (resp.ok) {
      const data = await resp.json();
      const markets = Array.isArray(data) ? data : data?.data || [];
      console.log(`[Shopping] USDA returned ${markets.length} markets`);
      
      for (const market of markets.slice(0, 5)) {
        results.push({
          name: market.listing_name || market.market_name || 'Farmers Market',
          location: [market.location_city, market.location_state].filter(Boolean).join(', '),
          distance: market.distance ? `${parseFloat(market.distance).toFixed(1)} mi` : undefined,
          url: market.market_link || market.listing_url || undefined,
          source: 'usda',
          source_label: '🌾 Farmers markets nearby',
        });
      }
    } else {
      console.warn(`[Shopping] USDA API returned ${resp.status}`);
    }
  } catch (e: any) {
    console.warn('[Shopping] USDA API error:', e.message);
  }

  return results;
}

// ─── 4. Google Places (nearby nurseries) ─────────────────────────────

async function searchGooglePlaces(
  zip: string,
  category?: string
): Promise<ShoppingResult[]> {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) {
    console.log('[Shopping] Google Places skipped — no API key');
    return [];
  }

  const results: ShoppingResult[] = [];

  try {
    // Geocode zip to lat/lng
    const geoResp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!geoResp.ok) return results;
    const geoData = await geoResp.json();
    const loc = geoData?.results?.[0]?.geometry?.location;
    if (!loc) return results;

    // Pick search keyword + label based on category
    const isSupplies = category && ['tools', 'fertilizer', 'equipment', 'supplies', 'soil', 'pots'].includes(category);
    const keyword = isSupplies
      ? 'garden+center+garden+supplies+home+improvement'
      : 'plant+nursery+garden+center';
    const label = isSupplies ? '🏪 Garden supply stores' : '🌿 Nurseries nearby';

    const placesResp = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=16000&keyword=${keyword}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (placesResp.ok) {
      const placesData = await placesResp.json();
      const places = placesData?.results || [];

      for (const place of places.slice(0, 5)) {
        results.push({
          name: place.name,
          location: place.vicinity || '',
          url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          source: 'google_places',
          source_label: label,
        });
      }
    }
  } catch (e: any) {
    console.warn('[Shopping] Google Places error:', e.message);
  }

  return results;
}

// ─── Waterfall orchestrator ──────────────────────────────────────────

async function searchAll(
  supabase: any,
  payload: SearchPayload
): Promise<{ results: ShoppingResult[]; sources_checked: string[] }> {
  const { search_items, category, user_id, zip_code } = payload;
  const allResults: ShoppingResult[] = [];
  const sourcesChecked: string[] = [];

  // Resolve user's zip code from profile if not provided
  let userZip = zip_code || '';
  if (!userZip && user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('zip_code')
      .eq('id', user_id)
      .single();
    userZip = profile?.zip_code || '';
  }

  // 1. Always search CasaGrown first (free, fast, our data)
  const casaResults = await searchCasaGrown(supabase, search_items);
  allResults.push(...casaResults);
  sourcesChecked.push('casagrown');
  console.log(`[Shopping] CasaGrown: ${casaResults.length} results`);

  // 2. Open Food Network (local food hubs)
  if (allResults.length < 5) {
    const ofnResults = await searchOFN(search_items);
    allResults.push(...ofnResults);
    sourcesChecked.push('ofn');
    console.log(`[Shopping] OFN: ${ofnResults.length} results`);
  }

  // 3. USDA farmers markets (when local results are sparse)
  if (allResults.length < 3 && userZip) {
    const usdaResults = await searchUSDA(userZip);
    allResults.push(...usdaResults);
    sourcesChecked.push('usda');
    console.log(`[Shopping] USDA: ${usdaResults.length} results`);
  }

  // 4. Google Places nurseries (when nothing found and we have location)
  if (allResults.length < 3 && userZip) {
    const placesResults = await searchGooglePlaces(userZip, category);
    allResults.push(...placesResults);
    sourcesChecked.push('google_places');
    console.log(`[Shopping] Places: ${placesResults.length} results`);
  }

  // If no location available and no results, note it
  if (allResults.length === 0 && !userZip) {
    console.log('[Shopping] No results — user has no location set');
  }

  return { results: allResults, sources_checked: sourcesChecked };
}

// ─── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: SearchPayload = await req.json();
    console.log(`[Shopping] Search: items=${JSON.stringify(payload.search_items)}, category=${payload.category}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { results, sources_checked } = await searchAll(supabase, payload);

    // Group by source label for display
    const grouped: Record<string, ShoppingResult[]> = {};
    for (const r of results) {
      const label = r.source_label;
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(r);
    }

    return new Response(
      JSON.stringify({
        backend_results: grouped,
        result_count: results.length,
        sources_checked,
        location_used: payload.zip_code || 'profile',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[Shopping] Error:', e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
