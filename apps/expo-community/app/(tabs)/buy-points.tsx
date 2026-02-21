import { BuyPointsScreen } from '@casagrown/app/features/points/BuyPointsScreen'
import { useRouter } from 'expo-router'

const logoSrc = require('../../assets/logo.png')

export default function BuyPointsTab() {
  const router = useRouter()

  const handleNavigateToFeed = () => router.push('/(tabs)/feed')
  const handleNavigateToProfile = () => router.push('/(tabs)/profile')
  const handleNavigateToChats = () => router.push('/(tabs)/chats')
  const handleNavigateToOrders = () => router.push('/(tabs)/orders')
  const handleNavigateToOffers = () => router.push('/(tabs)/offers')
  const handleNavigateToMyPosts = () => router.push('/(tabs)/my-posts')
  const handleNavigateToDelegate = () => router.push('/(tabs)/delegate')

  return (
    <BuyPointsScreen
      logoSrc={logoSrc}
      onNavigateToFeed={handleNavigateToFeed}
      onNavigateToProfile={handleNavigateToProfile}
      onNavigateToChats={handleNavigateToChats}
      onNavigateToOrders={handleNavigateToOrders}
      onNavigateToOffers={handleNavigateToOffers}
      onNavigateToMyPosts={handleNavigateToMyPosts}
      onNavigateToDelegate={handleNavigateToDelegate}
    />
  )
}
