import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

// Type Definitions
interface AddressRequest {
  streetAddress: string;
  secondaryAddress?: string;
  city: string;
  state: string;
  zipCode: string;
}

interface AddressResponse {
  address: {
    streetAddress: string;
    city: string;
    state: string;
    ZIPCode: string;
    ZIPPlus4: string;
  };
  jurisdiction: {
    county: string;
    fipsCode: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requestData: AddressRequest = await req.json();

    if (!requestData.streetAddress || !requestData.city || !requestData.state) {
      return new Response(
        JSON.stringify({ error: "Missing required address fields (streetAddress, city, state)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 1. Calculate SHA-256 hash of the normalized address fields for cache key
    const normalizedString = `${requestData.streetAddress}|${requestData.secondaryAddress || ''}|${requestData.city}|${requestData.state}|${requestData.zipCode || ''}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Query address_resolution_cache for a hit
    const { data: cachedRow, error: cacheErr } = await supabase
      .from('address_resolution_cache')
      .select('resolved_address')
      .eq('address_hash', hashHex)
      .maybeSingle();

    if (cacheErr) {
      console.warn(`[ADDRESS-CACHE] Cache query error: ${cacheErr.message}`);
    }

    if (cachedRow?.resolved_address) {
      console.log(`[ADDRESS-CACHE] Cache hit for hash: ${hashHex}`);
      return new Response(
        JSON.stringify(cachedRow.resolved_address),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`[ADDRESS-CACHE] Cache miss for hash: ${hashHex}. Calling Google API.`);

    // 4. Cache miss: Call Google Address Validation API
    const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!googleApiKey) {
      throw new Error("Missing GOOGLE_MAPS_API_KEY in environment.");
    }

    const googleUrl = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${googleApiKey}`;
    const addressLines = [requestData.streetAddress];
    if (requestData.secondaryAddress) {
      addressLines.push(requestData.secondaryAddress);
    }

    const googleResponse = await fetch(googleUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: {
          addressLines,
          locality: requestData.city,
          administrativeArea: requestData.state,
          postalCode: requestData.zipCode,
        }
      })
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error("Google Address API Error Response:", errorText);
      throw new Error(`Failed to validate address with Google: ${googleResponse.status} ${googleResponse.statusText}`);
    }

    const googleData = await googleResponse.json();
    const result = googleData.result;

    if (!result || !result.address) {
      return new Response(
        JSON.stringify({ error: "Google Address Validation API returned an incomplete response." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 5. Parse and map Google API response to standardized AddressResponse
    const uspsData = result.uspsData;
    let streetAddress = "";
    let city = "";
    let state = "";
    let ZIPCode = "";
    let ZIPPlus4 = "";
    let countyName = "Unknown";
    let fipsCode = "";

    if (uspsData?.standardizedAddress) {
      streetAddress = uspsData.standardizedAddress.firstAddressLine || "";
      if (uspsData.standardizedAddress.secondAddressLine) {
        streetAddress += ` ${uspsData.standardizedAddress.secondAddressLine}`;
      }
      city = uspsData.standardizedAddress.city || "";
      state = uspsData.standardizedAddress.state || "";
      ZIPCode = uspsData.standardizedAddress.zipCode || "";
      if (uspsData.standardizedAddress.zipCodePlus4) {
        ZIPPlus4 = `${ZIPCode}-${uspsData.standardizedAddress.zipCodePlus4}`;
      } else {
        ZIPPlus4 = ZIPCode;
      }
      
      if (uspsData.county) {
        countyName = uspsData.county.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      }
      if (uspsData.fipsCountyCode) {
        fipsCode = uspsData.fipsCountyCode;
      }
    } else {
      // Fallback mapping for non-US/non-USPS matched addresses
      const postalAddress = result.address.postalAddress;
      streetAddress = postalAddress.addressLines?.[0] || requestData.streetAddress;
      if (postalAddress.addressLines?.[1]) {
        streetAddress += ` ${postalAddress.addressLines[1]}`;
      }
      city = postalAddress.locality || requestData.city;
      state = postalAddress.administrativeArea || requestData.state;
      ZIPCode = postalAddress.postalCode || requestData.zipCode || "";
      ZIPPlus4 = ZIPCode;

      // Try to find county (administrative_area_level_2) in components
      const countyComponent = result.address.addressComponents?.find((c: any) =>
        c.componentType === "administrative_area_level_2"
      );
      if (countyComponent?.componentName?.text) {
        countyName = countyComponent.componentName.text.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      }
    }

    const responsePayload: AddressResponse = {
      address: {
        streetAddress,
        city,
        state,
        ZIPCode,
        ZIPPlus4
      },
      jurisdiction: {
        county: countyName,
        fipsCode
      }
    };

    // 6. Write to public.address_resolution_cache asynchronously/gracefully
    const { error: insertErr } = await supabase
      .from('address_resolution_cache')
      .insert({
        address_hash: hashHex,
        input_address: requestData,
        resolved_address: responsePayload
      });

    if (insertErr) {
      console.warn(`[ADDRESS-CACHE] Failed to write cache row: ${insertErr.message}`);
    } else {
      console.log(`[ADDRESS-CACHE] Cached standardized address for hash: ${hashHex}`);
    }

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Unhandled Edge Function Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal Server Error during address validation", details: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
})
