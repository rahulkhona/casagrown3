import { Redirect } from 'expo-router'

/**
 * Feed route - redirects to tabs layout
 * 
 * This is a top-level route that redirects to the tabbed feed view.
 * Used by login-screen when redirecting existing users after authentication.
 */
export default function FeedPage() {
  return <Redirect href="/(tabs)/feed" />
}
