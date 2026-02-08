/**
 * CommunityMap — Default entry point.
 * Metro bundler resolves .native.tsx automatically for iOS/Android.
 * Next.js and other web bundlers fall through to this file, so it must
 * re-export the web implementation (not native, which depends on react-native-webview).
 */
export { default } from './CommunityMap.web'
export type { CommunityMapProps } from './CommunityMapTypes'
