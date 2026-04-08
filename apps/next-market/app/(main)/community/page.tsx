import { Metadata } from 'next'
import ClientPage from './ClientPage'
import { createServerSupabase } from '../../../lib/supabase-server'
import { fetchCommunityMessages } from '../../../../../packages/app/features/community-chat/community-chat-service'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Community | CasaGrown',
  description: 'Connect with your neighbors, trade produce, and grow your local community.',
  openGraph: {
    title: 'CasaGrown Community — Neighborhood Community Chat',
    description: 'Connect with neighbors, share gardening tips, and trade homegrown produce.',
    images: [{ url: '/og-share.jpg', width: 1200, height: 630, alt: 'CasaGrown Community — Neighborhood Chat' }],
  },
}

export default async function CommunityChatPage() {
  const supabase = await createServerSupabase()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  let initialProfileH3 = null
  let initialMessages: any[] = []
  let profileName = ''
  let buzzWelcomedAt = null
  
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('home_community_h3_index, full_name, buzz_welcomed_at')
      .eq('id', user.id)
      .single()
      
    if (profile?.home_community_h3_index) {
      initialProfileH3 = profile.home_community_h3_index
      profileName = profile.full_name || ''
      buzzWelcomedAt = profile.buzz_welcomed_at
      
      try {
        initialMessages = await fetchCommunityMessages(supabase, initialProfileH3)
      } catch (e) {
        console.error('Failed to fetch initial messages server-side', e)
      }
    }
  }

  return (
    <ClientPage 
      initialProfileH3={initialProfileH3} 
      initialMessages={initialMessages} 
      initialProfileName={profileName}
      initialBuzzWelcomedAt={buzzWelcomedAt}
    />
  )
}
