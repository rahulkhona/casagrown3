/**
 * Contextual Profile Data Capture Helper
 * Backfills profile address and phone from Stripe billing/shipping details
 * if the user's profile currently has missing/empty address or phone.
 */
export async function backfillProfileFromStripeDetails(
  supabase: any,
  userId: string,
  details: {
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
    phone?: string | null;
  }
) {
  if (!userId || (!details.address && !details.phone)) return null;

  const { data: currentProfile, error } = await supabase
    .from("profiles")
    .select("street_address, city, state_code, zip_code, country_code, phone_number")
    .eq("id", userId)
    .single();

  if (error || !currentProfile) return null;

  const updates: Record<string, any> = {};
  const addr = details.address;

  if (!currentProfile.street_address && addr?.line1) {
    updates.street_address = addr.line2 ? `${addr.line1}, ${addr.line2}` : addr.line1;
  }
  if (!currentProfile.city && addr?.city) {
    updates.city = addr.city;
  }
  if (!currentProfile.state_code && addr?.state) {
    updates.state_code = addr.state;
  }
  if (!currentProfile.zip_code && addr?.postal_code) {
    updates.zip_code = addr.postal_code;
  }
  if (!currentProfile.country_code && addr?.country) {
    updates.country_code = addr.country;
  }
  if (!currentProfile.phone_number && details.phone) {
    updates.phone_number = details.phone;
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (updateErr) {
      console.error(`[PROFILE-BACKFILL] Failed to update profile for user ${userId}:`, updateErr);
    } else {
      console.log(`[PROFILE-BACKFILL] Successfully backfilled details for user ${userId}:`, updates);
    }
    return updates;
  }
  return null;
}
