import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cellToBoundary,
  cellToLatLng,
  gridDisk,
  latLngToCell,
} from "https://esm.sh/h3-js@4.1.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Environment Variables: URL or KEY");
      throw new Error("Misconfigured Server: Missing Supabase Credentials");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const requestBody = await req.json();
    console.log("Incoming Request Body:", JSON.stringify(requestBody));
    let { lat, lng, address } = requestBody;
    let geocodedNeighborhood = "";
    let geocodedCity = "";

    // 0. Geocoding (if address provided)
    if (address && (!lat || !lng)) {
      console.log(`Geocoding address: "${address}"...`);
      const nominatimUrl = new URL(
        "https://nominatim.openstreetmap.org/search",
      );
      nominatimUrl.searchParams.set("q", address);
      nominatimUrl.searchParams.set("format", "json");
      nominatimUrl.searchParams.set("limit", "1");
      nominatimUrl.searchParams.set("addressdetails", "1"); // Get structured address

      const geoResponse = await fetch(nominatimUrl.toString(), {
        headers: {
          // Nominatim requires a valid User-Agent
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

      // Extract neighborhood from geocoding (more reliable than OSM place query)
      const addr = geoData[0].address || {};
      geocodedNeighborhood = addr.neighbourhood || addr.suburb || addr.hamlet ||
        addr.town || "";
      geocodedCity = addr.city || addr.town || addr.municipality || "";

      console.log(
        `Resolved "${address}" to (${lat}, ${lng}), neighborhood: ${
          geocodedNeighborhood || "N/A"
        }`,
      );
    }

    if (!lat || !lng) {
      throw new Error("Missing location data (lat/lng or address)");
    }

    // 1. Calculate H3 Index
    // Resolution 7 is approx 5.16 km^2 (town/suburb size)
    // Resolution 8 is approx 0.73 km^2 (neighborhood size)
    const h3Index = latLngToCell(lat, lng, 7);
    console.log(
      `Resolved H3 Index (Res 7): ${h3Index} for location (${lat}, ${lng})`,
    );

    // Calculate Neighbors (k=1)
    const neighborIndices = gridDisk(h3Index, 1); // Returns origin + 6 neighbors
    // Filter out the origin itself for the "neighbors" list
    const adjacentIndices = neighborIndices.filter((idx: string) =>
      idx !== h3Index
    );

    // 2. Resolver Function (DB Check -> Overpass Gen)
    const resolveCommunity = async (
      index: string,
    ) => {
      // ... (rest of logic same) ...
      // Check DB
      const { data: existing, error } = await supabase
        .from("communities")
        .select("*")
        .eq("h3_index", index)
        .single();

      if (existing && !error) return existing;

      // If missing, Generate via Overpass
      console.log(`Generating community for ${index}...`);

      const boundary = cellToBoundary(index);
      const [lat, lng] = cellToLatLng(index);
      const centroidPoint = `POINT(${lng} ${lat})`;

      // Radius Search (1.5km) to catch nearby landmarks
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
        console.error(
          `Overpass Error: ${osmResponse.status} ${osmResponse.statusText}`,
        );
        throw new Error(`Overpass API Failed: ${osmResponse.status}`);
      }
      const osmData = await osmResponse.json();
      const elements = osmData.elements || [];

      // Naming Heuristic
      let bestName = `Community ${index.substring(0, 6)}...`;
      let nameSource = "fallback_index";
      let city = "Unknown";

      console.log(`[DEBUG H3 ${index}] Found ${elements.length} elements`);
      // VERBOSE DEBUG: Show all element types
      elements.forEach((e: any, i: number) => {
        console.log(
          `  [${i}] type=${e.type}, tags=${JSON.stringify(e.tags || {})}`,
        );
      });
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

      // Log what we found for debugging
      if (schools.length) {
        console.log(
          `  Schools: ${schools.map((e: any) => e.tags.name).join(", ")}`,
        );
      }
      if (parks.length) {
        console.log(
          `  Parks: ${parks.map((e: any) => e.tags.name).join(", ")}`,
        );
      }
      if (malls.length) {
        console.log(
          `  Malls: ${malls.map((e: any) => e.tags.name).join(", ")}`,
        );
      }
      if (majorRoads.length) {
        console.log(
          `  Major Roads: ${
            majorRoads.map((e: any) => e.tags.name).join(", ")
          }`,
        );
      }

      // Priority: Schools > Parks > Malls > Major Roads > Neighborhoods
      // Format: "[Landmark], [Neighborhood] Community"
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
        // Create intersection name from first two major roads
        landmarkName = `${majorRoads[0].tags.name} & ${
          majorRoads[1].tags.name
        }`;
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
      // If neither, bestName remains as fallback

      const addrElement = elements.find((e: any) => e.tags?.["addr:city"]);
      if (addrElement) city = addrElement.tags["addr:city"];

      // Create Geometry WKT
      const polygonPoints = boundary.map(([lat, lng]: number[]) =>
        `${lng} ${lat}`
      ).join(
        ",",
      );
      const firstPoint = boundary[0];
      const polygonString = `POLYGON((${polygonPoints}, ${firstPoint[1]} ${
        firstPoint[0]
      }))`;

      // centroidPoint already defined at line 101 using cellToLatLng

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
        if (insertError.code === "23505") { // Retrieve if concurrent insert
          const { data: retry } = await supabase.from("communities").select("*")
            .eq("h3_index", index).single();
          return retry;
        }
        throw insertError;
      }
      return inserted;
    };

    // 3. Resolve ALL Communities (Primary + Neighbors) in Parallel
    // We want to ensure NO "unexplored" communities.

    // Combine into unique set of indices to resolve
    const allIndices = Array.from(new Set([h3Index, ...adjacentIndices]));

    // Fetch existing from DB
    const { data: existingCommunities, error: fetchError } = await supabase
      .from("communities")
      .select("*")
      .in("h3_index", allIndices);

    if (fetchError) throw fetchError;

    const existingMap = new Map(
      existingCommunities?.map((c) => [c.h3_index, c]),
    );

    // Identify missing
    const missingIndices = allIndices.filter((idx) => !existingMap.has(idx));

    console.log(
      `Found ${existingMap.size} existing, need to generate ${missingIndices.length} communities`,
    );

    // Generate missing in parallel
    // Generate missing SEQUENTIALLY to avoid Overpass Rate Limits via 'Promise.all'
    const generatedCommunities = [];
    for (const idx of missingIndices) {
      try {
        const comm = await resolveCommunity(idx);
        if (comm) generatedCommunities.push(comm);
        // Delay to prevent Rate Limiting (2s for recovery)
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`Failed to generate community ${idx}:`, e);
        // Continue to next, don't break entire batch
      }
    }

    // Update Map with generated ones
    generatedCommunities.forEach((c) => {
      if (c) existingMap.set(c.h3_index, c);
    });

    // 4. Construct Response
    const primaryCommunity = existingMap.get(h3Index);
    if (!primaryCommunity) {
      throw new Error("Failed to resolve primary community");
    }

    // Enhance primary community name with geocoded neighborhood if not already included
    let enhancedPrimaryName = primaryCommunity.name;
    if (
      geocodedNeighborhood &&
      !enhancedPrimaryName.includes(geocodedNeighborhood)
    ) {
      // If name ends with "Community", insert neighborhood before it
      if (enhancedPrimaryName.endsWith(" Community")) {
        const baseName = enhancedPrimaryName.replace(" Community", "");
        enhancedPrimaryName = `${baseName}, ${geocodedNeighborhood} Community`;
      } else {
        enhancedPrimaryName = `${enhancedPrimaryName}, ${geocodedNeighborhood}`;
      }
    }

    const neighbors = adjacentIndices.map((idx: string) => {
      const comm = existingMap.get(idx);
      return {
        h3_index: idx,
        name: comm ? comm.name : "Unknown Community", // Should theoretically always be found now
        status: "active", // Always active since we eager loaded
      };
    });

    return new Response(
      JSON.stringify({
        primary: {
          ...primaryCommunity,
          name: enhancedPrimaryName, // Use enhanced name with neighborhood
        },
        neighbors: neighbors,
        resolved_location: { lat, lng },
        geocoded_neighborhood: geocodedNeighborhood || null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
