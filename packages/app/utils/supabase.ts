/**
 * Re-export the singleton Supabase client from auth-hook.
 *
 * IMPORTANT: There must be only ONE createClient() call in the entire app
 * to avoid "Multiple GoTrueClient instances" warnings, which cause
 * navigator.locks AbortError and infinite loading spinners.
 */
export { supabase } from "../features/auth/auth-hook";
