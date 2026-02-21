'use client'

import { BuyPointsScreen } from '@casagrown/app/features/points/BuyPointsScreen'
import { useRouter } from 'next/navigation'

export default function BuyPointsMockupPage() {
  const router = useRouter()

  const handleNavigateToFeed = () => router.push('/feed')
  const handleNavigateToProfile = () => router.push('/profile')
  const handleNavigateToChats = () => router.push('/chats')
  const handleNavigateToOrders = () => router.push('/orders')
  const handleNavigateToOffers = () => router.push('/offers')
  const handleNavigateToMyPosts = () => router.push('/my-posts')
  const handleNavigateToDelegate = () => router.push('/delegate')

  return (
    <BuyPointsScreen
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
