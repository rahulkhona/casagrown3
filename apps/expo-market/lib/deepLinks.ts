import * as Linking from 'expo-linking';
import { router } from 'expo-router';

/**
 * Resolves a CasaGrown URL (including shortened /r/ links) to the correct in-app route.
 * This is used by the deep link handler to route universal links.
 */
export async function resolveDeepLink(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // Shortened URLs — resolve via API
    if (pathname.startsWith('/r/')) {
      const token = pathname.replace('/r/', '');
      const response = await fetch(`${parsed.origin}/api/crm/short-links?token=${token}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (data.destination_url) {
        // Recursively resolve the destination
        return resolveDeepLink(data.destination_url);
      }
      return null;
    }

    // Direct route mappings
    if (pathname.startsWith('/market/product/')) return pathname;
    if (pathname.startsWith('/market/booth/')) return pathname;
    if (pathname.startsWith('/market')) return '/(tabs)';
    if (pathname.startsWith('/p/')) return pathname;
    if (pathname.startsWith('/orders/')) return pathname;
    if (pathname.startsWith('/orders')) return '/(tabs)/orders';
    if (pathname.startsWith('/community')) return '/(tabs)/community';
    if (pathname.startsWith('/messages')) return '/(tabs)/messages';
    if (pathname.startsWith('/create-listing')) return '/my-booth/products/new';
    if (pathname.startsWith('/get-started')) return '/my-booth/customize';
    if (pathname.startsWith('/join-booth/')) return pathname;
    if (pathname.startsWith('/voice/')) return pathname;
    if (pathname.startsWith('/voice')) return '/voice/index';

    // Default — let the web handle it
    return null;
  } catch (err) {
    console.error('Deep link resolution failed:', err);
    return null;
  }
}

/**
 * Handle an incoming deep link URL.
 * Called from the root layout's Linking listener.
 */
export async function handleDeepLink(url: string) {
  const route = await resolveDeepLink(url);
  if (route) {
    router.push(route as any);
  }
}
