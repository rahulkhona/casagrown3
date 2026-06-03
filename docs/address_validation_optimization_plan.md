# Address Validation & ZIP+4 Caching Optimization Plan

This document details the plan to migrate from the USPS Address validation API to the **Google Address Validation API** and implement an address resolution database-backed cache to optimize performance and eliminate redundant API costs.

---

## 1. Background & Goals

Currently, the `resolve-usps-address` edge function standardizes buyer/seller addresses during onboarding/profile setup, retrieves their **ZIP+4 (9-digit ZIP code)**, and determines their county.
* **Problem**: The USPS Address API (v3) is deprecating credentials on July 12th.
* **Solution**: Replace USPS with Google Address Validation API, utilizing our existing Google Maps billing infrastructure.
* **Optimization Goal**: Introduce a caching table (`address_resolution_cache`) to prevent redundant API queries when users click save multiple times, load profiles, or re-verify unaltered addresses.

---

## 2. Google Address Validation API Integration

Google's Address Validation API standardizes addresses to USPS CASS standards and returns detailed ZIP+4 and county metadata.

### Request Endpoint
`POST https://addressvalidation.googleapis.com/v1:validateAddress?key=YOUR_API_KEY`

### Request Body Format
```json
{
  "address": {
    "addressLines": ["123 Main St", "Apt 4B"],
    "locality": "Santa Clara",
    "administrativeArea": "CA",
    "postalCode": "95050"
  }
}
```

### Response Mapping
From the response JSON, we will extract the following fields to match our database profile attributes:
* **Standardized Street**: `result.uspsData.standardizedAddress.streetAddress` (or fallback to `result.address.postalAddress.addressLines[0]`)
* **Standardized City**: `result.uspsData.standardizedAddress.cityName`
* **Standardized State**: `result.uspsData.standardizedAddress.state`
* **ZIP Code**: `result.uspsData.standardizedAddress.zipCode`
* **ZIP+4 Extension**: `result.uspsData.standardizedAddress.zipCodeExtension`
* **County Name**: `result.uspsData.standardizedAddress.county`

---

## 3. Database Cache Design

We will add a new database table, `address_resolution_cache`, to store normalized lookup inputs mapped to their verified standardization records.

### Table Schema (SQL DDL)
```sql
CREATE TABLE public.address_resolution_cache (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Normalized lookup key (lower-case, trimmed fields hashed or concatenated)
    input_hash text UNIQUE NOT NULL, 
    raw_input_address jsonb NOT NULL,
    
    -- Cached standardized outputs
    standardized_street text NOT NULL,
    standardized_city text NOT NULL,
    standardized_state_code text NOT NULL,
    standardized_zip_code text NOT NULL, -- e.g. "95014"
    zip_plus4 text NOT NULL,             -- e.g. "95014-2041"
    county text,                         -- e.g. "Santa Clara"
    
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for sub-millisecond lookup latency
CREATE INDEX idx_address_resolution_hash ON public.address_resolution_cache(input_hash);
```

---

## 4. Execution Flow in the Edge Function

We will update the `resolve-usps-address` function (or rename it `resolve-google-address`) to execute this logic:

1. **Calculate Cache Key**:
   * Normalize input fields: trim whitespace, convert to lowercase, and concatenate:
     `key_string = street_address + "|" + secondary_address + "|" + city + "|" + state + "|" + zip`
   * Generate SHA-256 hash or use raw normalized string as `input_hash`.

2. **Query Local Database Cache**:
   * Run a quick select statement against `address_resolution_cache` matching `input_hash`.
   * **Cache Hit**: If a record exists, immediately return the cached standardization and ZIP+4.

3. **Call Google Address Validation API (Cache Miss)**:
   * Execute the POST request to the Google Address Validation API.
   * Parse the response and extract the standardized fields, ZIP+4, and county.

4. **Persist Result to Cache**:
   * Write the new standardized details and computed `input_hash` to the database using `INSERT INTO address_resolution_cache ... ON CONFLICT DO NOTHING`.
   * Return the normalized details back to the client.

---

## 5. Benefits & Cost Breakdown

* **Google API Cost**: $17.00 per 1,000 requests ($0.017/request).
* **Caching Savings**:
  * Profile Saves: Profile updates that don't modify the address block (e.g. updating profile pictures, garden items, or notifications) will hit the cache and cost **$0**.
  * Re-validation: Double-clicks or page reloads by buyers/sellers during onboarding will cost **$0**.
* **Performance**: Under 10ms database lookup latency vs. 300ms+ Google API latency.
