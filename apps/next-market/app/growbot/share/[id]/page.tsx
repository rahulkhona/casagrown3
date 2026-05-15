import { Metadata } from 'next'
import { createServerSupabase } from '../../../../lib/supabase-server'
import SharePageClient from './SharePageClient'

interface SharePageProps {
  params: Promise<{ id: string }>
}

/**
 * Server-side metadata for GrowBot poll share pages.
 * Generates dynamic OG tags so Facebook, Nextdoor, etc. show a rich preview.
 */
export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data: poll } = await supabase
    .from('growbot_shared_responses')
    .select('question, bot_response, actions, image_url')
    .eq('id', id)
    .single()

  if (!poll) {
    return {
      title: 'Poll Not Found — GrowBot by CasaGrown',
      description: 'This GrowBot community poll is no longer available.',
    }
  }

  // Build a description from bot_response text OR action card data
  let description = poll.bot_response?.trim() || ''
  if (!description && poll.actions?.length > 0) {
    const action = poll.actions[0]
    const d = action.data || {}
    switch (action.type) {
      case 'DiagnosisCard':
        description = `🔬 Diagnosis: ${d.diagnosis || 'Unknown'} | Urgency: ${d.urgency || 'N/A'}`
        if (d.remedy_plan || d.remedyPlan) description += `\n${(d.remedy_plan || d.remedyPlan).slice(0, 200)}`
        break
      case 'PlantIdentificationCard':
        description = `🌿 ${d.common_name || d.commonName || d.name || 'Unknown plant'} (${d.scientific_name || d.scientificName || 'N/A'})`
        if (d.description) description += `\n${d.description.slice(0, 200)}`
        break
      case 'RecipeCard':
        description = `🍽️ ${d.name || d.title || 'Recipe'}`
        if (d.description) description += ` — ${d.description.slice(0, 200)}`
        break
    }
  }
  // Truncate for OG
  if (description.length > 300) description = description.slice(0, 300) + '…'

  const title = `🗳️ "${poll.question}" — GrowBot Community Poll`
  const ogImage = poll.image_url || '/og-share.png'

  return {
    title,
    description: description || `Vote on whether GrowBot's answer is accurate: "${poll.question}"`,
    openGraph: {
      title,
      description: description || `Vote on whether GrowBot's answer is accurate: "${poll.question}"`,
      siteName: 'CasaGrown',
      type: 'website',
      url: `/growbot/share/${id}`,
      images: [{ url: ogImage, alt: poll.question }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description || `Vote on whether GrowBot's answer is accurate.`,
      images: [ogImage],
    },
  }
}

export default async function GrowBotSharePage({ params }: SharePageProps) {
  const { id } = await params
  return <SharePageClient id={id} />
}
