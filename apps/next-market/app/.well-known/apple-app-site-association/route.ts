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
          appIDs: ['V2W982L9M4.com.casagrown.market'],
          components: [
            // Exclude marketing/landing pages (must come first — Apple matches in order)
            { '/': '/pro', exclude: true },
            { '/': '/pro/*', exclude: true },
            { '/': '/p/*', exclude: true },
            { '/': '/r/*', exclude: true },
            { '/': '/sell', exclude: true },
            { '/': '/sell/*', exclude: true },
            { '/': '/sellers', exclude: true },
            { '/': '/sellers/*', exclude: true },
            { '/': '/join', exclude: true },
            { '/': '/join/*', exclude: true },
            { '/': '/check-nutrition-loss', exclude: true },
            { '/': '/check-nutrition-loss/*', exclude: true },
            { '/': '/testers', exclude: true },
            { '/': '/testers/*', exclude: true },
            { '/': '/farmer', exclude: true },
            { '/': '/farmer/*', exclude: true },
            { '/': '/gardener', exclude: true },
            { '/': '/gardener/*', exclude: true },
            // App routes — open in native app
            // NOTE: /market (exact) is excluded because the native app's WebView
            // loads this URL on launch. If included, iOS intercepts the WebView
            // navigation and opens Safari instead. /market/* still works for
            // deep links to specific booths and products.
            { '/': '/market', exclude: true },
            { '/': '/market/*' },
            { '/': '/cart' },
            { '/': '/cart/*' },
            { '/': '/chat/*' },
            { '/': '/community/*' },
            { '/': '/create-listing' },
            { '/': '/create-listing/*' },
            { '/': '/orders/*' },
            { '/': '/messages/*' },
            { '/': '/my-booth/*' },
            { '/': '/my-stands/*' },
            { '/': '/notifications' },
            { '/': '/notifications/*' },
            { '/': '/profile' },
            { '/': '/profile/*' },
            { '/': '/profile-setup' },
            { '/': '/profile-setup/*' },
            { '/': '/settings' },
            { '/': '/settings/*' },
            { '/': '/earnings/*' },
            { '/': '/growbot/*' },
            { '/': '/following' },
            { '/': '/following/*' },
            { '/': '/login' },
            { '/': '/login/*' },
            { '/': '/logout' },
            { '/': '/join-booth/*' },
            { '/': '/delete-account' },
            { '/': '/delete-account/*' },
            { '/': '/terms' },
            { '/': '/voice/*' },
            { '/': '/quarantines' },
            { '/': '/quarantines/*' },
            { '/': '/get-started/*' },
            { '/': '/guide' },
            { '/': '/guide/*' },
            { '/': '/helping' },
            { '/': '/helping/*' },
            { '/': '/pro-manage' },
            { '/': '/pro-manage/*' },
          ],
        },
      ],
    },
    webcredentials: {
      apps: ['V2W982L9M4.com.casagrown.market'],
    },
  };

  return NextResponse.json(aasa, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
