import { FeedScreen } from '@casagrown/app/features/feed/feed-screen'
import { useRouter } from 'expo-router'

// Import the logo asset for mobile
const logoSrc = require('../../assets/logo.png')

export default function FeedTab() {
  const router = useRouter()

  const handleCreatePost = () => {
    // TODO: Navigate to create post screen when implemented
    console.log('Create post pressed')
  }

  const handleNavigateToProfile = () => {
    router.push('/(tabs)/profile')
  }

  return (
    <FeedScreen
      onCreatePost={handleCreatePost}
      onNavigateToProfile={handleNavigateToProfile}
      logoSrc={logoSrc}
    />
  )
}
