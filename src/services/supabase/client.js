import { createClient } from '@supabase/supabase-js'
import { config, isSupabaseConfigured } from '@/services/config'
import { AppError } from '@/utils/errors'

let client = null

/**
 * The single Supabase client. Throws a `not_configured` AppError when the
 * project has no Supabase credentials, so callers can show an honest
 * "configuration required" state instead of failing silently.
 */
export function supabase() {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase is not configured for this deployment.')
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'meetzy-auth',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return client
}

/** Unwrap a supabase-js `{ data, error }` result, throwing an AppError. */
export function unwrap({ data, error }) {
  if (error) throw AppError.from(error)
  return data
}
