/**
 * update-zip-codes — Supabase Edge Function
 *
 * One-time batch utility: downloads US zip code CSV data and upserts
 * states, cities, and zip codes into the location tables.
 */

import { parse } from "https://deno.land/std@0.181.0/encoding/csv.ts";
import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";

serveWithCors(async (_req, { supabase, corsHeaders }) => {
  console.log("Fetching zip codes...");
  const response = await fetch(
    "https://raw.githubusercontent.com/akinniyi/US-Zip-Codes-With-City-State/master/uszips.csv",
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.statusText}`);
  }

  const csvText = await response.text();

  console.log("Parsing CSV...");
  const data = await parse(csvText, {
    skipFirstRow: true,
    columns: [
      "zip",
      "lat",
      "lng",
      "city",
      "state_id",
      "state_name",
      "zcta",
      "parent_zcta",
      "population",
      "density",
      "county_fips",
      "county_name",
      "all_county_weights",
      "imprecise",
      "military",
      "timezone",
    ],
  });

  console.log(`Parsed ${data.length} rows. Starting upsert...`);

  // ── 1. Upsert unique states ─────────────────────────────────────────────

  console.log("Extracting unique states...");
  const uniqueStates = [
    ...new Set(
      data.map((d: any) =>
        JSON.stringify({ code: d.state_id, name: d.state_name })
      ),
    ),
  ].map((s: string) => JSON.parse(s));

  console.log(`Upserting ${uniqueStates.length} states...`);
  await supabase.from("states").upsert(
    uniqueStates.map((s: { code: string; name: string }) => ({
      country_iso_3: "USA",
      code: s.code,
      name: s.name,
    })),
    { onConflict: "country_iso_3, code" },
  );

  const { data: allStates } = await supabase
    .from("states")
    .select("code, id")
    .eq("country_iso_3", "USA");
  const stateMap = new Map(allStates?.map((s: any) => [s.code, s.id]));

  // ── 2. Upsert unique cities ─────────────────────────────────────────────

  console.log("Extracting unique cities...");
  const uniqueCities = [
    ...new Set(
      data.map((d: any) => JSON.stringify({ state: d.state_id, city: d.city })),
    ),
  ].map((s: string) => JSON.parse(s));

  const cityRows = uniqueCities
    .map((c: { state: string; city: string }) => {
      const sId = stateMap.get(c.state);
      if (!sId) return null;
      return { state_id: sId, name: c.city };
    })
    .filter((c: unknown) => c !== null);

  console.log(`Upserting ${cityRows.length} cities...`);
  const cityChunkSize = 1000;
  for (let i = 0; i < cityRows.length; i += cityChunkSize) {
    const chunk = cityRows.slice(i, i + cityChunkSize);
    await supabase.from("cities").upsert(chunk, {
      onConflict: "state_id, name",
    });
  }

  // ── 3. Upsert unique counties ────────────────────────────────────────────

  console.log("Extracting unique counties...");
  const uniqueCounties = [
    ...new Set(
      data
        .filter((d: any) => d.county_name && d.county_name.trim())
        .map((d: any) =>
          JSON.stringify({ state: d.state_id, county: d.county_name, fips: d.county_fips })
        ),
    ),
  ].map((s: string) => JSON.parse(s));

  const countyRows = uniqueCounties
    .map((c: { state: string; county: string; fips: string }) => {
      const sId = stateMap.get(c.state);
      if (!sId) return null;
      return { state_id: sId, name: c.county, fips_code: c.fips || null };
    })
    .filter((c: unknown) => c !== null);

  console.log(`Upserting ${countyRows.length} counties...`);
  const countyChunkSize = 500;
  for (let i = 0; i < countyRows.length; i += countyChunkSize) {
    const chunk = countyRows.slice(i, i + countyChunkSize);
    await supabase.from("counties").upsert(chunk, {
      onConflict: "state_id, name",
    });
  }

  // Fetch all county IDs
  const allCountiesFromDB: any[] = [];
  let countyHasMore = true;
  let countyOffset = 0;
  console.log("Fetching all counties from DB...");
  while (countyHasMore) {
    const { data: countyBatch, error: fetchError } = await supabase
      .from("counties")
      .select("state_id, name, id")
      .range(countyOffset, countyOffset + 999);
    if (fetchError) {
      console.error("Error fetching counties batch:", fetchError.message);
      break;
    }
    if (countyBatch && countyBatch.length > 0) {
      allCountiesFromDB.push(...countyBatch);
      countyOffset += 1000;
      if (countyBatch.length < 1000) countyHasMore = false;
    } else {
      countyHasMore = false;
    }
  }
  console.log(`Fetched ${allCountiesFromDB.length} counties total.`);

  const countyMap = new Map<string, string>();
  allCountiesFromDB.forEach((c: any) => {
    countyMap.set(`${c.state_id}:${c.name}`, c.id);
  });

  // ── 4. Fetch all city IDs for zip mapping ───────────────────────────────

  const allCitiesFromDB: any[] = [];
  let hasMore = true;
  let offset = 0;
  const cityFetchBatchSize = 1000;

  console.log("Fetching all cities from DB...");
  while (hasMore) {
    const { data: cityBatch, error: fetchError } = await supabase
      .from("cities")
      .select("state_id, name, id")
      .range(offset, offset + cityFetchBatchSize - 1);

    if (fetchError) {
      console.error("Error fetching cities batch:", fetchError.message);
      break;
    }

    if (cityBatch && cityBatch.length > 0) {
      allCitiesFromDB.push(...cityBatch);
      offset += cityFetchBatchSize;
      if (cityBatch.length < cityFetchBatchSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }
  console.log(`Fetched ${allCitiesFromDB.length} cities total.`);

  const cityMap = new Map<string, string>();
  allCitiesFromDB.forEach((c: any) => {
    cityMap.set(`${c.state_id}:${c.name}`, c.id);
  });

  // ── 5. Upsert zip codes (chunked) ───────────────────────────────────────

  console.log(`Preparing to upsert all ${data.length} zip codes...`);

  const zipRows = data
    .map((row: any) => {
      const stateId = stateMap.get(row.state_id);
      const cityKey = `${stateId}:${row.city}`;
      const cityId = cityMap.get(cityKey);

      if (!stateId || !cityId) {
        if (Math.random() < 0.001) {
          console.log(
            `Mapping failure for zip ${row.zip}: stateFound=${!!stateId} (code=${row.state_id}), cityFound=${!!cityId} (key=${cityKey})`,
          );
        }
        return null;
      }

      // Resolve county_id for this zip
      const countyKey = row.county_name ? `${stateId}:${row.county_name}` : null;
      const countyId = countyKey ? countyMap.get(countyKey) || null : null;

      return {
        zip_code: row.zip,
        country_iso_3: "USA",
        city_id: cityId,
        county_id: countyId,
        latitude: parseFloat(row.lat) || 0,
        longitude: parseFloat(row.lng) || 0,
      };
    })
    .filter((z: unknown) => z !== null);

  const zipChunkSize = 1000;
  for (let i = 0; i < zipRows.length; i += zipChunkSize) {
    const chunk = zipRows.slice(i, i + zipChunkSize);
    console.log(
      `Upserting zip chunk ${Math.floor(i / zipChunkSize) + 1}/${
        Math.ceil(zipRows.length / zipChunkSize)
      }...`,
    );
    const { error } = await supabase
      .from("zip_codes")
      .upsert(chunk, { onConflict: "zip_code, country_iso_3" });
    if (error) {
      console.error(`Error upserting zip chunk: ${error.message}`);
    }
  }

  return jsonOk(
    {
      success: true,
      count: zipRows.length,
      message: "Batch processed successfully",
    },
    corsHeaders,
  );
});
