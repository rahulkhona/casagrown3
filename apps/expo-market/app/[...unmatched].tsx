/**
 * Catch-all route for deep links.
 *
 * When Android or iOS opens the app via a deep link (e.g. /r/kswv6bj9,
 * /market/booth/123, /create-listing), expo-router tries to match the URL
 * to a route file. Since our app is a single WebView shell with no
 * file-system routes for these paths, we need a catch-all that renders
 * the same AppShell component. The AppShell handles all navigation
 * internally via its WebView.
 */
export { default } from './index';
