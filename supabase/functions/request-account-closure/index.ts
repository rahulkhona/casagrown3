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

  // 3. Check fast-path eligibility
  const { data: isEligible } = await supabase.rpc('check_fast_path_eligible', {
    p_user_id: userId
  })

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
