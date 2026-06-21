/**
 * request-account-closure — Edge function for account deletion
 *
 * Handles two paths:
 *   1. Fast-path: Zero-footprint user → immediate hard delete
 *   2. Phase-based: User with financial/social history → freeze + async settlement
 *
 * POST /functions/v1/request-account-closure
 * Auth: Bearer token (user JWT)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'

async function deleteUserStorage(userId: string, supabase: any) {
  const buckets = [
    'avatars',
    'product-photos',
    'chat-media',
    'feedback-media',
    'feedback-screenshots',
    'community-chat-media',
    'order-evidence'
  ]

  for (const bucket of buckets) {
    try {
      // List all files recursively under the user's ID prefix
      const { data: files, error: listError } = await supabase.storage
        .from(bucket)
        .list(userId, { recursive: true })

      if (listError) {
        console.error(`[storage cleanup] Error listing files in ${bucket}:`, listError.message)
        continue
      }

      if (files && files.length > 0) {
        // Build relative file paths for deletion
        const filePaths = files
          .filter((f: any) => f.id !== null) // skip virtual folder placeholders
          .map((f: any) => `${userId}/${f.name}`)

        if (filePaths.length > 0) {
          const { error: removeError } = await supabase.storage
            .from(bucket)
            .remove(filePaths)

          if (removeError) {
            console.error(`[storage cleanup] Error removing files from ${bucket}:`, removeError.message)
          } else {
            console.log(`[storage cleanup] Deleted ${filePaths.length} files from bucket ${bucket}`)
          }
        }
      }
    } catch (err: any) {
      console.error(`[storage cleanup] Unexpected error for bucket ${bucket}:`, err.message || err)
    }
  }
}

serveWithCors(async (req, { supabase, corsHeaders }) => {
  // 1. Authenticate user
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const userId = auth

  // Service role calls not allowed — this is a user-initiated action
  if (userId === 'service_role') {
    return jsonError('Account closure must be user-initiated', corsHeaders, 403)
  }

  // 2. Check if account is already in closure
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, closure_status, email')
    .eq('id', userId)
    .single()

  if (!profile) {
    return jsonError('Profile not found', corsHeaders, 404)
  }

  if (profile.closure_status) {
    return jsonError(`Account already in closure process: ${profile.closure_status}`, corsHeaders, 409)
  }

  // 2b. BUG-37: Check for financial blockers before allowing closure
  const blockers: Array<{ type: string; message: string; action: string }> = []

  // Check balance
  const { data: balance } = await supabase
    .from('user_balances')
    .select('available_usd, pending_usd')
    .eq('user_id', userId)
    .single()

  if (balance?.available_usd > 0) {
    blockers.push({
      type: 'balance',
      message: `You have $${Number(balance.available_usd).toFixed(2)} in earnings — withdraw first`,
      action: '/earnings/payout',
    })
  }

  // Check pending/unfulfilled orders (as seller)
  const { count: pendingOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', userId)
    .in('status', ['pending', 'accepted', 'ready'])

  if ((pendingOrders || 0) > 0) {
    blockers.push({
      type: 'pending_orders',
      message: `You have ${pendingOrders} unfulfilled order${pendingOrders! > 1 ? 's' : ''} — complete them first`,
      action: '/orders',
    })
  }

  // Check active subscription
  const { data: activeSub } = await supabase
    .from('seller_subscriptions')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .limit(1)
    .maybeSingle()

  if (activeSub) {
    blockers.push({
      type: 'active_subscription',
      message: 'You have an active Pro plan — cancel first',
      action: '/manage-plan',
    })
  }

  // Check pending payouts
  const { count: pendingPayouts } = await supabase
    .from('redemption_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])

  if ((pendingPayouts || 0) > 0) {
    blockers.push({
      type: 'pending_payouts',
      message: `You have ${pendingPayouts} pending payout${pendingPayouts! > 1 ? 's' : ''} — wait for completion`,
      action: '/earnings',
    })
  }

  if (blockers.length > 0) {
    return jsonOk({
      success: false,
      blockers,
      message: `Cannot close account: ${blockers.length} issue${blockers.length > 1 ? 's' : ''} must be resolved first`,
    }, corsHeaders)
  }

  // 3. Check fast-path eligibility
  const { data: isEligible } = await supabase.rpc('check_fast_path_eligible', {
    p_user_id: userId
  })

  // Delete all user-uploaded files from Supabase Storage buckets
  await deleteUserStorage(userId, supabase)

  if (isEligible) {
    // Fast-path: immediate hard delete
    const { data: deleteResult } = await supabase.rpc('execute_fast_path_delete', {
      p_user_id: userId
    })

    if (deleteResult?.error) {
      return jsonError(deleteResult.error, corsHeaders)
    }

    // Delete auth.users record entirely (no profile to keep)
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      console.error('Failed to delete auth user:', authDeleteError.message)
      // Non-fatal — profile is already gone
    }

    return jsonOk({
      success: true,
      path: 'fast_delete',
      message: 'Account fully deleted'
    }, corsHeaders)
  }

  // 4. Phase-based: Execute Phase 1 freeze
  const { data: freezeResult } = await supabase.rpc('execute_phase_1_freeze', {
    p_user_id: userId
  })

  if (freezeResult?.error) {
    return jsonError(freezeResult.error, corsHeaders)
  }

  // 5. Ban user in auth (prevent login)
  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: '876000h', // ~100 years
  })

  if (banError) {
    console.error('Failed to ban auth user:', banError.message)
    // Non-fatal — closure_status = 'frozen' will still prevent access
  }

  return jsonOk({
    success: true,
    path: 'phase_1_freeze',
    ...freezeResult
  }, corsHeaders)
})
