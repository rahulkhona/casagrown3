import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Apple App Site Association (AASA) route handler.
 * 
 * iOS fetches this file from casagrown.com/.well-known/apple-app-site-association
 * to determine which URLs should open in the CasaGrown Market native app
 * instead of Safari.
 * 
 * Requirements:
 * - Must be served at exact path /.well-known/apple-app-site-association
 * - Content-Type must be application/json
 * - Must NOT redirect (Apple rejects 3xx responses)
 * - Must be served over HTTPS
 */
export async function GET() {
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: ['casagrown.com.casagrown.market'],
          components: [
            { '/': '/market/*' },
            { '/': '/p/*' },
            { '/': '/r/*' },
            { '/': '/orders/*' },
            { '/': '/create-listing' },
            { '/': '/join-booth/*' },
            { '/': '/sell' },
          ],
        },
      ],
    },
    webcredentials: {
      apps: ['casagrown.com.casagrown.market'],
    },
  };

  return NextResponse.json(aasa, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
