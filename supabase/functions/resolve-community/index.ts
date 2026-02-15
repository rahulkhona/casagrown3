import { serveWithCors } from "../_shared/serve-with-cors.ts";
import {
  cellToBoundary,
  cellToLatLng,
  gridDisk,
  latLngToCell,
} from "https://esm.sh/h3-js@4.1.0?target=deno";

/**
 * resolve-community — Supabase Edge Function
 *
 * Given a lat/lng (or address), resolves the primary H3 community cell
 * and its neighbors, creating them lazily from Overpass / Nominatim if needed.
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
  const t0 = Date.now();

  const requestBody = await req.json();
  console.log("Incoming Request Body:", JSON.stringify(requestBody));
  let { lat, lng, address } = requestBody;
  let geocodedNeighborhood = "";
  let geocodedCity = "";

  // ─── 0. Geocoding (if address provided) ─────────────────────
  if (address && (!lat || !lng)) {
    const tGeo = Date.now();
    console.log(`Geocoding address: "${address}"...`);
    const nominatimUrl = new URL(
      "https://nominatim.openstreetmap.org/search",
    );
    nominatimUrl.searchParams.set("q", address);
    nominatimUrl.searchParams.set("format", "json");
    nominatimUrl.searchParams.set("limit", "1");
    nominatimUrl.searchParams.set("addressdetails", "1");

    const geoResponse = await fetch(nominatimUrl.toString(), {
      headers: {
        "User-Agent": "CasaGrownApp/1.0 (internal-dev-testing)",
      },
    });

    if (!geoResponse.ok) throw new Error("Geocoding service failed");

    const geoData = await geoResponse.json();
    if (!geoData || geoData.length === 0) {
      throw new Error("Address not found");
    }

    lat = parseFloat(geoData[0].lat);
    lng = parseFloat(geoData[0].lon);

    const addr = geoData[0].address || {};
    geocodedNeighborhood = addr.neighbourhood || addr.suburb ||
      addr.hamlet ||
      addr.town || "";
    geocodedCity = addr.city || addr.town || addr.municipality || "";

    console.log(
      `⏱️ Nominatim geocoding: ${
        Date.now() - tGeo
      }ms → (${lat}, ${lng}), neighborhood: ${
        geocodedNeighborhood || "N/A"
      }, city: ${geocodedCity || "N/A"}`,
    );
  }

  if (!lat || !lng) {
    throw new Error("Missing location data (lat/lng or address)");
  }

  // ─── Reverse geocode for lat/lng requests (for fallback names) ───
  if (!geocodedNeighborhood && !geocodedCity) {
    try {
      const tReverse = Date.now();
      const reverseUrl = new URL(
        "https://nominatim.openstreetmap.org/reverse",
      );
      reverseUrl.searchParams.set("lat", String(lat));
      reverseUrl.searchParams.set("lon", String(lng));
      reverseUrl.searchParams.set("format", "json");
      reverseUrl.searchParams.set("addressdetails", "1");
      reverseUrl.searchParams.set("zoom", "14");

      const reverseResponse = await fetch(reverseUrl.toString(), {
        headers: {
          "User-Agent": "CasaGrownApp/1.0 (internal-dev-testing)",
        },
      });

      if (reverseResponse.ok) {
        const reverseData = await reverseResponse.json();
        const addr = reverseData.address || {};
        geocodedNeighborhood = addr.neighbourhood || addr.suburb ||
          addr.hamlet || addr.town || "";
        geocodedCity = addr.city || addr.town || addr.municipality ||
          "";
        console.log(
          `⏱️ Nominatim reverse geocode: ${
            Date.now() - tReverse
          }ms → neighborhood: ${geocodedNeighborhood || "N/A"}, city: ${
            geocodedCity || "N/A"
          }`,
        );
      }
    } catch (e) {
      console.warn(
        "Reverse geocode failed, using index-only names:",
        e,
      );
    }
  }

  // ─── 1. Calculate H3 Index ──────────────────────────────────
  const h3Index = latLngToCell(lat, lng, 7);
  console.log(
    `Resolved H3 Index (Res 7): ${h3Index} for location (${lat}, ${lng})`,
  );

  const neighborIndices = gridDisk(h3Index, 1);
  const adjacentIndices = neighborIndices.filter(
    (idx: string) => idx !== h3Index,
  );

  // ─── 2. Batch fetch ALL communities from DB ─────────────────
  const allIndices = Array.from(new Set([h3Index, ...adjacentIndices]));

  const tDb = Date.now();
  const { data: existingCommunities, error: fetchError } = await supabase
    .from("communities")
    .select("*")
    .in("h3_index", allIndices);

  if (fetchError) throw fetchError;

  const existingMap = new Map(
    existingCommunities?.map((c: any) => [c.h3_index, c]),
  );
  console.log(
    `⏱️ DB batch lookup: ${
      Date.now() - tDb
    }ms → found ${existingMap.size}/${allIndices.length} communities`,
  );

  // ─── 3. Generate missing communities ────────────────────────
  const missingIndices = allIndices.filter((idx) => !existingMap.has(idx));

  if (missingIndices.length > 0) {
    console.log(
      `Generating ${missingIndices.length} missing communities...`,
    );

    let overpassRateLimited = false;

    for (const idx of missingIndices) {
      const tGen = Date.now();

      if (!overpassRateLimited) {
        try {
          const comm = await generateCommunityFromOverpass(
            supabase,
            idx,
          );
          if (comm) {
            existingMap.set(comm.h3_index, comm);
            console.log(
              `⏱️ Overpass generation for ${idx}: ${Date.now() - tGen}ms`,
            );
            continue;
          }
        } catch (e: any) {
          if (e.message?.includes("429")) {
            console.warn(
              `⚠️ Overpass rate-limited — switching to fallback names`,
            );
            overpassRateLimited = true;
          } else {
            console.error(`Overpass failed for ${idx}:`, e);
          }
        }
      }

      // Fallback
      try {
        const comm = await createFallbackCommunity(
          supabase,
          idx,
          geocodedNeighborhood,
          geocodedCity,
        );
        if (comm) {
          existingMap.set(comm.h3_index, comm);
          console.log(
            `✅ Fallback community created for ${idx}: "${comm.name}" (${
              Date.now() - tGen
            }ms)`,
          );
        }
      } catch (e) {
        console.error(
          `Failed to create fallback community ${idx}:`,
          e,
        );
      }
    }

    // Fire-and-forget: trigger background enrichment
    supabase.functions.invoke("enrich-communities", {
      body: { limit: 5 },
    }).then((res: any) => {
      if (res.error) {
        console.warn(
          "⚠️ Enrich-communities trigger failed:",
          res.error,
        );
      } else {
        console.log(
          "🔄 Enrich-communities triggered for fallback communities",
        );
      }
    }).catch((e: any) => {
      console.warn(
        "⚠️ Enrich-communities fire-and-forget failed:",
        e,
      );
    });
  } else {
    console.log(
      "✅ All communities found in DB cache — no generation needed",
    );
  }

  // ─── 4. Construct Response ──────────────────────────────────
  const primaryCommunity = existingMap.get(h3Index);
  if (!primaryCommunity) {
    throw new Error("Failed to resolve primary community");
  }

  // Enhance primary name with geocoded neighborhood
  let enhancedPrimaryName = primaryCommunity.name;
  if (
    geocodedNeighborhood &&
    !enhancedPrimaryName.includes(geocodedNeighborhood)
  ) {
    if (enhancedPrimaryName.endsWith(" Community")) {
      const baseName = enhancedPrimaryName.replace(" Community", "");
      enhancedPrimaryName = `${baseName}, ${geocodedNeighborhood} Community`;
    } else if (!enhancedPrimaryName.includes("·")) {
      enhancedPrimaryName = `${enhancedPrimaryName}, ${geocodedNeighborhood}`;
    }
  }

  const neighbors = adjacentIndices.map((idx: string) => {
    const comm = existingMap.get(idx);
    return {
      h3_index: idx,
      name: comm ? comm.name : "Unknown Community",
      status: "active",
    };
  });

  // ─── 5. Compute hex boundaries for native map rendering ─────
  const hexBoundaries: Record<string, number[][]> = {};
  for (const idx of allIndices) {
    try {
      hexBoundaries[idx] = cellToBoundary(idx);
    } catch (_e) {
      // Skip if boundary computation fails
    }
  }

  console.log(`⏱️ Total request time: ${Date.now() - t0}ms`);

  return new Response(
    JSON.stringify({
      primary: {
        ...primaryCommunity,
        name: enhancedPrimaryName,
      },
      neighbors: neighbors,
      resolved_location: { lat, lng },
      hex_boundaries: hexBoundaries,
      geocoded_neighborhood: geocodedNeighborhood || null,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
});

// ============================================================================
// Overpass Community Generator (used when NOT rate-limited)
// ============================================================================
async function generateCommunityFromOverpass(
  supabase: any,
  index: string,
) {
  console.log(`Generating community for ${index} via Overpass...`);

  const boundary = cellToBoundary(index);
  const [lat, lng] = cellToLatLng(index);
  const centroidPoint = `POINT(${lng} ${lat})`;

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

  // Naming Heuristic
  let bestName = `Community ${index.substring(0, 6)}...`;
  let nameSource = "fallback_index";
  let city = "Unknown";

  console.log(`[DEBUG H3 ${index}] Found ${elements.length} elements`);

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

  // Priority: Schools > Parks > Malls > Major Roads > Neighborhoods
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

  // Build the community name
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

  // Create Geometry WKT
  const polygonPoints = boundary.map(([bLat, bLng]: number[]) =>
    `${bLng} ${bLat}`
  ).join(",");
  const firstPoint = boundary[0];
  const polygonString = `POLYGON((${polygonPoints}, ${firstPoint[1]} ${
    firstPoint[0]
  }))`;

  const newCommunity = {
    h3_index: index,
    name: bestName,
    metadata: { source: nameSource, osm_elements_found: elements.length },
    city: city,
    location: centroidPoint,
    boundary: polygonString,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("communities")
    .insert(newCommunity)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: retry } = await supabase.from("communities").select(
        "*",
      )
        .eq("h3_index", index).single();
      return retry;
    }
    throw insertError;
  }
  return inserted;
}

// ============================================================================
// Fallback Community Creator (used when Overpass is rate-limited)
// ============================================================================
function extractZoneSuffix(h3Index: string): string {
  const core = h3Index.replace(/f+$/, "");
  return core.substring(core.length - 3);
}

async function createFallbackCommunity(
  supabase: any,
  index: string,
  geocodedNeighborhood: string,
  geocodedCity: string,
) {
  const boundary = cellToBoundary(index);
  const [lat, lng] = cellToLatLng(index);
  const centroidPoint = `POINT(${lng} ${lat})`;

  const zoneSuffix = extractZoneSuffix(index);
  const locationPart = geocodedNeighborhood || geocodedCity || "Community";
  const fallbackName = `Zone ${zoneSuffix} · ${locationPart}`;

  const polygonPoints = boundary.map(([bLat, bLng]: number[]) =>
    `${bLng} ${bLat}`
  ).join(",");
  const firstPoint = boundary[0];
  const polygonString = `POLYGON((${polygonPoints}, ${firstPoint[1]} ${
    firstPoint[0]
  }))`;

  const newCommunity = {
    h3_index: index,
    name: fallbackName,
    metadata: {
      source: "nominatim_fallback",
      geocoded_neighborhood: geocodedNeighborhood || null,
      geocoded_city: geocodedCity || null,
    },
    city: geocodedCity || "Unknown",
    location: centroidPoint,
    boundary: polygonString,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("communities")
    .upsert(newCommunity, { onConflict: "h3_index" })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }
  return inserted;
}
