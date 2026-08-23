import { sendCommunityMessage } from './community-chat-service'

export interface AutoPostProductParams {
  supabase: any
  userId: string
  productId: string
  productName: string
  priceUsd: number | string
  unit: string
  fallbackAddress?: string | null
  secondaryFallbackAddress?: string | null
  customMessage?: string
  geocodeFn?: (address: string) => Promise<{ lat: number; lng: number } | null>
}

export interface AutoPostResult {
  success: boolean
  h3Index?: string
  messageId?: string
  reason?: string
}

/**
 * Automatically posts a new product listing to the local /community chat.
 * Resolves H3 index using priority order:
 * 1. profiles.home_community_h3_index
 * 2. fallbackAddress (e.g., Booth Base Address / Delivery Zip) -> Geocode -> latLngToCell
 * 3. secondaryFallbackAddress (e.g., Pickup Address) -> Geocode -> latLngToCell
 */
export async function autoPostProductToCommunity(
  params: AutoPostProductParams
): Promise<AutoPostResult> {
  const {
    supabase,
    userId,
    productId,
    productName,
    priceUsd,
    unit,
    fallbackAddress,
    secondaryFallbackAddress,
    customMessage,
    geocodeFn,
  } = params

  try {
    // Priority 1: Check profile's home_community_h3_index
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('home_community_h3_index, full_name')
      .eq('id', userId)
      .maybeSingle()

    if (profError) {
      console.warn('[AutoPost] Error fetching profile:', profError)
    }

    let h3Index = profile?.home_community_h3_index || null

    // Function helper to resolve H3 from an address string
    const resolveH3FromAddress = async (addr: string): Promise<string | null> => {
      if (!addr || !addr.trim()) return null
      try {
        let geo: { lat: number; lng: number } | null = null
        if (geocodeFn) {
          geo = await geocodeFn(addr)
        } else {
          // Dynamic import of geocodeAddress if available in Next.js environment
          try {
            const geocodeModule = await import('../../../../apps/next-market/lib/geocode')
            geo = await geocodeModule.geocodeAddress(addr)
          } catch {
            console.warn('[AutoPost] geocodeAddress module unavailable')
          }
        }

        if (geo?.lat != null && geo?.lng != null) {
          const { latLngToCell } = await import('h3-js')
          return latLngToCell(geo.lat, geo.lng, 7)
        }
      } catch (err) {
        console.warn('[AutoPost] Address H3 resolution failed:', err)
      }
      return null
    }

    // Priority 2: Fallback address
    if (!h3Index && fallbackAddress) {
      h3Index = await resolveH3FromAddress(fallbackAddress)
    }

    // Priority 3: Secondary fallback address
    if (!h3Index && secondaryFallbackAddress) {
      h3Index = await resolveH3FromAddress(secondaryFallbackAddress)
    }

    if (!h3Index) {
      console.warn('[AutoPost] Could not resolve H3 index for user listing auto-post', { userId, productId })
      return { success: false, reason: 'Could not resolve H3 index' }
    }

    // If profile didn't have home_community_h3_index, sync it now so RLS allows posting & user joins local community
    if (!profile?.home_community_h3_index) {
      try {
        await supabase
          .from('profiles')
          .update({ home_community_h3_index: h3Index })
          .eq('id', userId)
      } catch (profSyncErr) {
        console.warn('[AutoPost] Profile H3 sync warning:', profSyncErr)
      }
    }

    // Ensure community row exists to satisfy FK constraint
    try {
      await supabase
        .from('communities')
        .upsert({ h3_index: h3Index, name: 'Local Community' }, { onConflict: 'h3_index' })
    } catch (commErr) {
      console.warn('[AutoPost] Community upsert warning:', commErr)
    }

    const messageContent =
      customMessage ||
      `🌿 New listing! ${productName} — $${priceUsd}/${unit}. Browse & order on CasaGrown Market! 🛒`

    // Insert directly into community_chat_messages
    const { data: insertedMsg, error: insertError } = await supabase
      .from('community_chat_messages')
      .insert({
        community_h3_index: h3Index,
        author_id: userId,
        content: messageContent,
        product_listing_id: productId,
        is_system: true,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[AutoPost] Failed to insert community chat message:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
      })
      return { success: false, reason: insertError.message }
    }

    return {
      success: true,
      h3Index,
      messageId: insertedMsg?.id,
    }
  } catch (err: any) {
    console.error('[AutoPost] Unexpected error:', err)
    return { success: false, reason: err?.message || 'Unknown error' }
  }
}
