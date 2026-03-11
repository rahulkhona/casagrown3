import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

// Type Definitions
interface AddressRequest {
  streetAddress: string;
  secondaryAddress?: string;
  city: string;
  state: string;
  zipCode: string; // Original 5-digit zip provided by Google Places
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

// Global Cache for USPS OAuth Token (expires every 1 hour typically)
let uspsAccessToken: string | null = null;
let uspsTokenExpiry: number = 0;

async function getUspsToken(): Promise<string> {
  // Return cached token if still valid (with a 60-second buffer)
  if (uspsAccessToken && Date.now() < uspsTokenExpiry - 60000) {
    return uspsAccessToken;
  }

  const consumerKey = Deno.env.get("USPS_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("USPS_CONSUMER_SECRET");

  if (!consumerKey || !consumerSecret) {
    throw new Error("Missing USPS credentials in Deno environment.");
  }

  const tokenUrl = "https://api.usps.com/oauth2/v3/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: consumerKey,
    client_secret: consumerSecret
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("USPS Token Error Response:", errorText);
    throw new Error(`Failed to authenticate with USPS: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  uspsAccessToken = data.access_token;
  // Convert 'expires_in' (seconds) to absolute JS timestamp
  uspsTokenExpiry = Date.now() + (parseInt(data.expires_in, 10) * 1000);

  return uspsAccessToken as string;
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

    // 1. Get USPS Access Token
    const token = await getUspsToken();

    // 2. Format requested address according to Address API v3
    // USPS API expects query parameters for standard address validation
    const uspsApiUrl = new URL("https://api.usps.com/addresses/v3/address");
    uspsApiUrl.searchParams.append("streetAddress", requestData.streetAddress);
    if (requestData.secondaryAddress) {
      uspsApiUrl.searchParams.append("secondaryAddress", requestData.secondaryAddress);
    }
    uspsApiUrl.searchParams.append("city", requestData.city);
    uspsApiUrl.searchParams.append("state", requestData.state);
    if (requestData.zipCode) {
      uspsApiUrl.searchParams.append("ZIPCode", requestData.zipCode);
    }

    // 3. Make Address API request
    const addressResponse = await fetch(uspsApiUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });

    if (!addressResponse.ok) {
        const errorBody = await addressResponse.text();
        console.error("USPS Address API Error Details:", errorBody);
        
        // Handle common USPS API errors, like "Address Not Found" based on status
        if(addressResponse.status === 404 || addressResponse.status === 400) {
           return new Response(
                JSON.stringify({ error: "Address validation failed. The provided address is invalid or not found in the USPS database." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            ); 
        }

        throw new Error(`USPS Address API failed: ${addressResponse.status} ${addressResponse.statusText}`);
    }

    const addressData = await addressResponse.json();

    // The API might return multiple firm matches or just an address. 
    // Usually, the first 'address' object is what we need.
    const primaryAddress = addressData.address;

    if (!primaryAddress || !primaryAddress.ZIPCode || !primaryAddress.ZIPPlus4) {
      return new Response(
        JSON.stringify({ error: "USPS returned an incomplete address resolution (missing Zip+4)." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 4. City/State/County API (To get the definitive jurisdiction details to pair with Zip+4)
    // The base Address API often does not return the county or standardizes it differently.
    // The "City/State API" in the Address 3.0 suite provides accurate county mappings based on ZipCode
    // https://developer.usps.com/api/81/city-state
    
    // According to USPS API v3 documentation, standard address resolution includes county natively in some tiers
    // However, if we need to explicitly query city/state data by ZIP we can do so. 
    // Assuming the parsed standard address contains the ZIP code we need to query for county:
    
    const cityStateUrl = new URL(`https://api.usps.com/addresses/v3/city-state`);
    cityStateUrl.searchParams.append("ZIPCode", primaryAddress.ZIPCode);

    const cityStateResponse = await fetch(cityStateUrl.toString(), {
         method: "GET",
         headers: {
           "Authorization": `Bearer ${token}`,
           "Accept": "application/json"
         }
    });

    let countyName = "Unknown";
    let fipsCode = "";

    if (cityStateResponse.ok) {
        const cityStateData = await cityStateResponse.json();
        // The City State API returns 'county' under the city/state details array
        // We look for the detail that explicitly matches the verified Zip code
        if (cityStateData && cityStateData.cityStateDetails && cityStateData.cityStateDetails.length > 0) {
            // USPS often returns multiple acceptable cities for a Zip. 
            // The primary is usually at index 0 or matches the primaryAddress city.
            const matchedDetail = cityStateData.cityStateDetails.find((d: any) => d.city === primaryAddress.city) || cityStateData.cityStateDetails[0];
            
            if (matchedDetail && matchedDetail.county) {
                // Formatting "SANTA CLARA" -> "Santa Clara"
                countyName = matchedDetail.county.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
            }
        }
    } else {
        console.warn(`Failed to resolve county for Zip ${primaryAddress.ZIPCode}: ${cityStateResponse.status}`);
    }

    // 5. Construct Final Parsed Response
    const responsePayload: AddressResponse = {
      address: {
        streetAddress: primaryAddress.streetAddress, // Now standardized by USPS
        city: primaryAddress.city,
        state: primaryAddress.state,
        ZIPCode: primaryAddress.ZIPCode,
        ZIPPlus4: `${primaryAddress.ZIPCode}-${primaryAddress.ZIPPlus4}` // Full 9 digit format
      },
      jurisdiction: {
        county: countyName,
        fipsCode: fipsCode, // Left blank unless USPS exposes it in the same payload
      }
    };

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
