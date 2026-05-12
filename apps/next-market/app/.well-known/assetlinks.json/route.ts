import { NextResponse } from 'next/server';

/**
 * Android Digital Asset Links route handler.
 * 
 * Google fetches this file from casagrown.com/.well-known/assetlinks.json
 * to verify that the CasaGrown Market Android app is authorized to handle
 * URLs from this domain (App Links / autoVerify).
 * 
 * The SHA256 fingerprint must match the app's signing key.
 * For debug builds, get it with:
 *   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
 */
export async function GET() {
  const assetLinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.casagrown.market',
        sha256_cert_fingerprints: [
          // Verified signing key from Play Console
          'CD:66:CA:85:C5:E6:02:D0:93:CD:99:8F:7E:0E:0A:29:81:C8:34:9C:D7:7E:F0:16:23:D8:27:39:1A:BB:24:5F',
        ],
      },
    },
  ];

  return NextResponse.json(assetLinks, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
