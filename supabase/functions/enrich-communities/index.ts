import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";
import { cellToLatLng } from "https://esm.sh/h3-js@4.1.0?target=deno";

/**
 * enrich-communities
 *
 * Background function that enriches communities created with fallback names
 * (metadata.source = 'nominatim_fallback') using Overpass API data.
 *
 * Processes ONE community per invocation to avoid Overpass rate limits.
 * Designed to be called by a cron job every ~30 seconds.
 *
 * Usage:
 *   POST /functions/v1/enrich-communities
 *   Authorization: Bearer <service_role_key>
 *
 * Optional body:
 *   { "limit": 1 }  — number of communities to process (default 1)
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
  // Parse optional limit from body
  let limit = 1;
  try {
    const body = await req.json();
    if (body?.limit && typeof body.limit === "number") {
      limit = Math.min(body.limit, 5); // Cap at 5 per invocation
    }
  } catch (_e) {
    // No body or invalid JSON — use default
  }

  // Find communities needing enrichment
  const { data: communities, error: fetchError } = await supabase
    .from("communities")
    .select("*")
    .in("metadata->>source", ["nominatim_fallback"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) throw fetchError;

  if (!communities || communities.length === 0) {
    return jsonOk(
      { message: "No communities need enrichment" },
      corsHeaders,
    );
  }

  const results: Array<{
    h3_index: string;
    status: string;
    old_name: string;
    new_name?: string;
  }> = [];

  for (const community of communities) {
    // Claim this community by setting source to 'enriching'
    const { error: claimError } = await supabase
      .from("communities")
      .update({
        metadata: {
          ...community.metadata,
          source: "enriching",
          claimed_at: new Date().toISOString(),
        },
      })
      .eq("h3_index", community.h3_index)
      .eq("metadata->>source", "nominatim_fallback"); // CAS

    if (claimError) {
      console.warn(
        `Could not claim ${community.h3_index}, skipping`,
      );
      continue;
    }

    try {
      const enriched = await enrichCommunityFromOverpass(
        supabase,
        community,
      );
      results.push({
        h3_index: community.h3_index,
        status: "enriched",
        old_name: community.name,
        new_name: enriched.name,
      });
    } catch (e: any) {
      // On failure, reset back to nominatim_fallback so it gets retried
      await supabase
        .from("communities")
        .update({
          metadata: {
            ...community.metadata,
            source: "nominatim_fallback",
            last_enrichment_error: e.message || "unknown",
            last_enrichment_attempt: new Date().toISOString(),
          },
        })
        .eq("h3_index", community.h3_index);

      if (e.message?.includes("429")) {
        console.warn(
          `Overpass rate-limited — stopping enrichment batch early`,
        );
        results.push({
          h3_index: community.h3_index,
          status: "rate_limited",
          old_name: community.name,
        });
        break;
      }
      console.error(
        `Failed to enrich ${community.h3_index}:`,
        e,
      );
      results.push({
        h3_index: community.h3_index,
        status: "error",
        old_name: community.name,
      });
    }
  }

  return jsonOk({ processed: results.length, results }, corsHeaders);
}, { errorStatus: 500 });

// ============================================================================
// Enrich a single community using Overpass data
// ============================================================================
async function enrichCommunityFromOverpass(
  supabase: any,
  community: any,
) {
  const index = community.h3_index;
  const [lat, lng] = cellToLatLng(index);

  console.log(`Enriching community ${index} ("${community.name}")...`);

  const radius = 1500;
  const overpassQuery = `
      [out:json][timeout:25];
      (
        node["place"~"neighbourhood|suburb|quarter"](around:${radius},${lat},${lng});
        way["place"~"neighbourhood|suburb|quarter"](around:${radius},${lat},${lng});
        relation["place"~"neighbourhood|suburb|quarter"](around:${radius},${lat},${lng});

        node["leisure"="park"]["name"](around:${radius},${lat},${lng});
        way["leisure"="park"]["name"](around:${radius},${lat},${lng});
        relation["leisure"="park"]["name"](around:${radius},${lat},${lng});

        node["amenity"~"school|university|college"]["name"](around:${radius},${lat},${lng});
        way["amenity"~"school|university|college"]["name"](around:${radius},${lat},${lng});
        relation["amenity"~"school|university|college"]["name"](around:${radius},${lat},${lng});
        
        node["shop"="mall"]["name"](around:${radius},${lat},${lng});
        way["shop"="mall"]["name"](around:${radius},${lat},${lng});
        relation["shop"="mall"]["name"](around:${radius},${lat},${lng});
        
        way["highway"~"primary|secondary|tertiary"]["name"](around:${radius},${lat},${lng});
      );
      out center 50;
    `;

  const overpassUrl = "https://overpass-api.de/api/interpreter";
  const osmResponse = await fetch(overpassUrl, {
    method: "POST",
    headers: {
      "User-Agent": "CasaGrownApp/1.0 (internal-dev-testing)",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  });

  if (!osmResponse.ok) {
    throw new Error(`Overpass API Failed: ${osmResponse.status}`);
  }

  const osmData = await osmResponse.json();
  const elements = osmData.elements || [];

  console.log(`[DEBUG H3 ${index}] Found ${elements.length} elements`);

  // Same naming heuristic as resolve-community
  let bestName = community.name;
  let nameSource = "osm_enriched";
  let city = community.city || "Unknown";

  const neighborhoods = elements.filter((e: any) =>
    e.tags?.place &&
    ["neighbourhood", "suburb", "quarter"].includes(e.tags.place)
  );
  const parks = elements.filter((e: any) => e.tags?.leisure === "park");
  const schools = elements.filter((e: any) =>
    e.tags?.amenity &&
    ["school", "university", "college"].includes(e.tags.amenity)
  );
  const malls = elements.filter((e: any) => e.tags?.shop === "mall");
  const majorRoads = elements.filter((e: any) =>
    e.tags?.highway &&
    ["primary", "secondary", "tertiary"].includes(e.tags.highway) &&
    e.tags?.name
  );

  let landmarkName = "";
  const neighborhoodName = neighborhoods.length > 0
    ? neighborhoods[0].tags.name
    : "";

  if (schools.length > 0) {
    landmarkName = schools[0].tags.name || "";
    nameSource = "osm_school";
  } else if (parks.length > 0) {
    landmarkName = parks[0].tags.name || "";
    nameSource = "osm_park";
  } else if (malls.length > 0) {
    landmarkName = malls[0].tags.name || "";
    nameSource = "osm_mall";
  } else if (majorRoads.length >= 2) {
    landmarkName = `${majorRoads[0].tags.name} & ${majorRoads[1].tags.name}`;
    nameSource = "osm_intersection";
  } else if (majorRoads.length === 1) {
    landmarkName = majorRoads[0].tags.name || "";
    nameSource = "osm_road";
  }

  // Build the enriched name
  if (landmarkName && neighborhoodName) {
    bestName = `${landmarkName}, ${neighborhoodName} Community`;
  } else if (landmarkName) {
    bestName = `${landmarkName} Community`;
  } else if (neighborhoodName) {
    bestName = `${neighborhoodName} Community`;
    nameSource = "osm_neighborhood";
  }

  const addrElement = elements.find((e: any) => e.tags?.["addr:city"]);
  if (addrElement) city = addrElement.tags["addr:city"];

  // Update the community
  const { data: updated, error: updateError } = await supabase
    .from("communities")
    .update({
      name: bestName,
      city: city,
      metadata: {
        source: nameSource,
        osm_elements_found: elements.length,
        enriched_at: new Date().toISOString(),
        previous_name: community.name,
      },
    })
    .eq("h3_index", index)
    .select()
    .single();

  if (updateError) throw updateError;

  console.log(
    `✅ Enriched ${index}: "${community.name}" → "${bestName}"`,
  );

  return updated;
}
