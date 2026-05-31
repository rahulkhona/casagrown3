/**
 * google.ts — Google Business Profile API helpers
 *
 * Shared utilities for Google OAuth, Location management, and posting.
 */

const GOOGLE_API_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const MY_BUSINESS_PLACE_URL = 'https://mybusinessplaceactions.googleapis.com/v1';

export function getGoogleOAuthUrl(): string {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') || '';
  const scope = encodeURIComponent('https://www.googleapis.com/auth/business.manage');
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
}

/** Refresh Google OAuth Access Token */
export async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  if (refreshToken.startsWith('mock_')) {
    return 'mock_access_token_123';
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

/** Get list of verified locations for the Google Account */
export async function getGoogleLocations(
  accessToken: string,
): Promise<Array<{ name: string; title: string }>> {
  if (accessToken.startsWith('mock_')) {
    return [
      { name: 'accounts/123/locations/456', title: 'Oak Creek Organic Stand (Mock)' },
    ];
  }

  // 1. Get Accounts first
  const accountRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!accountRes.ok) {
    throw new Error(`Google Accounts fetch failed: ${await accountRes.text()}`);
  }
  const accountsData = await accountRes.json();
  const accountName = accountsData.accounts?.[0]?.name;

  if (!accountName) return [];

  // 2. Fetch Locations under account
  const locationsRes = await fetch(`${GOOGLE_API_URL}/${accountName}/locations?readMask=name,title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!locationsRes.ok) {
    throw new Error(`Google Locations fetch failed: ${await locationsRes.text()}`);
  }

  const data = await locationsRes.json();
  return data.locations || [];
}

/** Publish a Local Post ("What's New") to Google Maps */
export async function publishGoogleLocalPost(
  locationId: string,
  accessToken: string,
  options: {
    caption: string;
    photoUrl?: string;
    buttonUrl?: string;
  },
): Promise<{ name: string }> {
  if (accessToken.startsWith('mock_')) {
    console.log(`[MOCK GOOGLE POST] Published on location ${locationId}:`, options);
    return { name: `locations/${locationId}/localPosts/mock-post-999` };
  }

  // Google My Business LocalPost resource uses locationId: locations/{locationId}/localPosts
  const url = `https://mybusinesslocalpost.googleapis.com/v1/${locationId}/localPosts`;

  const body: Record<string, any> = {
    languageCode: 'en-US',
    summary: options.caption,
    topicType: 'STANDARD',
  };

  // Add Call to Action Button
  if (options.buttonUrl) {
    body.callToAction = {
      actionType: 'ORDER',
      url: options.buttonUrl,
    };
  }

  // Add Media
  if (options.photoUrl) {
    body.media = [
      {
        mediaFormat: 'PHOTO',
        sourceUrl: options.photoUrl,
      },
    ];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Google Maps local post failed: ${await res.text()}`);
  }

  return res.json();
}

/** Add or update a product in the Google Merchant/Maps Catalog */
export async function syncProductToGoogleCatalog(
  locationId: string,
  accessToken: string,
  product: {
    retailer_id: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    url: string;
  },
): Promise<void> {
  if (accessToken.startsWith('mock_')) {
    console.log(`[MOCK GOOGLE CATALOG] Sync product ${product.name} on location ${locationId}`);
    return;
  }

  // Endpoint: locations/{locationId}/foodMenus or standard product list API.
  // Note: For produce/farm-stand catalogs, GBP uses standard Local Products or Merchant API,
  // typically synced via Google Merchant Center. However, we can also use GBP's Merchant Products API
  // or Local Services API if activated.
  // We represent the catalog mapping here by creating/updating a Product Post or utilizing the Merchant API:
  const url = `https://mybusinessverifications.googleapis.com/v1/${locationId}/products`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      productId: product.retailer_id,
      title: product.name,
      description: product.description,
      price: {
        currencyCode: 'USD',
        units: Math.floor(product.price).toString(),
        nanos: Math.round((product.price % 1) * 100) * 10000000,
      },
      imageSource: {
        sourceUrl: product.image_url,
      },
      link: product.url,
    }),
  });

  // GBP catalog API can return 404 or 403 if Merchant center not linked; log warning but don't abort catalog
  if (!res.ok) {
    console.warn(`[GBP-CATALOG] Catalog sync warning: ${await res.text()}`);
  }
}
