/**
 * Runtime configuration read from Vite env variables. Only public values
 * live here: the Supabase anon key and a referrer-restricted Maps key.
 * Server secrets (Google server key, service role) exist only as Supabase
 * Edge Function secrets.
 */
const read = (name) => (import.meta.env[name] ?? '').toString().trim()

export const config = Object.freeze({
  supabaseUrl: read('VITE_SUPABASE_URL'),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
  mapsApiKey: read('VITE_GOOGLE_MAPS_API_KEY'),
  mapsMapId: read('VITE_GOOGLE_MAPS_MAP_ID') || 'DEMO_MAP_ID',
})

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
export const isMapsConfigured = Boolean(config.mapsApiKey)

/** Names (never values) of the variables that still need setting. */
export function missingConfig() {
  const missing = []
  if (!config.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!config.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (!config.mapsApiKey) missing.push('VITE_GOOGLE_MAPS_API_KEY')
  return missing
}

export const appOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')
