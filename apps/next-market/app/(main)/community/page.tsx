import { Metadata } from 'next'
import ClientPage from './ClientPage'
import { createServerSupabase } from '../../../lib/supabase-server'
import { fetchCommunityMessages } from '../../../../../packages/app/features/community-chat/community-chat-service'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{ message_id?: string }> }): Promise<Metadata> {
  const resolvedParams = searchParams ? await searchParams : undefined;
  
  if (resolvedParams?.message_id) {
    try {
      const supabase = await createServerSupabase();
      const { data: msg } = await supabase
        .from('community_chat_messages')
        .select('content, sender_name')
        .eq('id', resolvedParams.message_id)
        .single();
        
      if (msg) {
        const title = msg.sender_name 
          ? `CasaGrown Community: Message from ${msg.sender_name}`
          : 'CasaGrown Community Message';
        const description = msg.content.length > 150 ? msg.content.slice(0, 147) + '...' : msg.content;
        return {
          title,
          description,
          openGraph: {
            title,
            description,
            type: 'website',
          }
        }
      }
    } catch(e) {}
  }

  return {
    title: 'Community | CasaGrown',
    description: 'Connect with your neighbors, trade produce, and grow your local community.',
    openGraph: {
      title: 'CasaGrown Community — Neighborhood Community Chat',
      description: 'Connect with neighbors, share gardening tips, and trade homegrown produce.',
      type: 'website',
      images: [{ url: '/og-share.jpg', width: 1200, height: 630, alt: 'CasaGrown Community — Neighborhood Chat' }],
    },
  }
}


export default async function CommunityChatPage({ searchParams }: { searchParams?: Promise<{ message_id?: string }> }) {
  const supabase = await createServerSupabase()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  let initialProfileH3 = null
  let initialMessages: any[] = []
  let profileName = ''
  let buzzWelcomedAt = null
  const isGuest = !user
  
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
        let fetchLimit = 50
        if (buzzWelcomedAt) {
          try {
            const { getCommunityUnreadCount } = await import('../../../../../packages/app/features/community-chat/community-chat-service')
            const unread = await getCommunityUnreadCount(supabase, initialProfileH3, buzzWelcomedAt)
            // Dynamically expand the payload window if they missed many messages.
            // This ensures the frontend "scroll to last read" anchor isn't paginated out of existence.
            if (unread > 0) {
              fetchLimit = Math.min(Math.max(unread + 20, 50), 150)
            }
          } catch (err) {
             console.error('Failed unread count fetch', err)
          }
        }
        const resolvedParams = searchParams ? await searchParams : undefined
        const targetMessageId = resolvedParams?.message_id
        if (targetMessageId) {
          try {
            const { data: targetMsg } = await supabase.from('community_chat_messages').select('created_at').eq('id', targetMessageId).single()
            if (targetMsg?.created_at) {
              const { count, error } = await supabase.from('community_chat_messages')
                .select('*', { count: 'exact', head: true })
                .eq('community_h3_index', initialProfileH3)
                .gte('created_at', targetMsg.created_at)
              if (!error && count) {
                fetchLimit = Math.max(fetchLimit, Math.min(count + 20, 500))
              }
            }
          } catch (e) { console.error('Failed deep link count', e) }
        }
        
        initialMessages = await fetchCommunityMessages(supabase, initialProfileH3, null, fetchLimit)
      } catch (e) {
        console.error('Failed to fetch initial messages server-side', e)
      }
    }
  } else {
    // Guest mode: fetch global feed (RPC ignores H3 filter)
    try {
      initialMessages = await fetchCommunityMessages(supabase, 'guest', null, 50)
    } catch (e) {
      console.error('Failed to fetch guest community messages', e)
    }
  }

  return (
    <ClientPage 
      initialProfileH3={initialProfileH3} 
      initialMessages={initialMessages} 
      initialProfileName={profileName}
      initialBuzzWelcomedAt={buzzWelcomedAt}
      isGuest={isGuest}
    />
  )
}
