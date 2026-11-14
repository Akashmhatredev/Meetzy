/**
 * Error codes come from three places: Postgres RPCs raise
 * `message = '<code>'` with a human `detail`, the Edge Functions return
 * `{ ok: false, error: { code, message } }`, and Supabase Auth returns its
 * own messages. AppError normalises all of them.
 */
const FRIENDLY = {
  not_configured: 'This deployment is missing its configuration. See the setup guide.',
  not_authenticated: 'Please sign in again.',
  forbidden: "You don't have permission to do that.",
  not_found: "That doesn't exist anymore, or you're not a member.",
  rate_limited: "You're doing that a lot. Please wait a few minutes and try again.",
  hangout_closed: 'This hangout is closed.',
  voting_closed: 'Voting is closed for this hangout.',
  invalid_input: 'Please check the details and try again.',
  invalid_transition: "That step isn't available right now.",
  invalid_deadline: 'The voting deadline must be in the future.',
  no_venues: 'No venues found yet. Calculate the meeting point first.',
  already_running: 'Meetzy is already calculating for this hangout.',
  calculation_running: 'Hang tight, a calculation is still running.',
  not_enough_locations: 'At least two friends need to share a location first.',
  no_activities: 'Pick at least one activity first.',
  too_many_participants: 'Meetzy can optimise for up to 25 people at a time.',
  no_routes: "Google couldn't find routes for this group with the selected travel mode.",
  google_error: 'Google Maps did not respond as expected. Please try again shortly.',
  group_limit_reached: 'You can be in up to 50 groups.',
  location_limit_reached: 'You can save up to 10 places.',
  activity_limit_reached: 'That hangout has reached its activity limit.',
  hangout_limit_reached: 'This group already has 20 open hangouts.',
  network: "Can't reach the server. Check your connection and try again.",
  geolocation_denied: 'Location permission was denied. You can search for an address instead.',
  geolocation_unavailable: "Your browser couldn't determine your location.",
  maps_unavailable: "Google Maps couldn't load.",
  internal: 'Something went wrong. Please try again.',
}

const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'Wrong email or password.'],
  [/email not confirmed/i, 'Confirm your email first. Check your inbox for the link.'],
  [/user already registered/i, 'An account with this email already exists. Try signing in.'],
  [/password should be at least/i, 'Use a password with at least 8 characters.'],
  [/rate limit/i, 'Too many attempts. Please wait a moment and try again.'],
  [/failed to fetch|networkerror|load failed/i, FRIENDLY.network],
]

export class AppError extends Error {
  constructor(code, message, detail) {
    super(message || FRIENDLY[code] || FRIENDLY.internal)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }

  static from(error) {
    if (!error) return new AppError('internal')
    if (error instanceof AppError) return error
    const raw = String(error.message || '')
    // Postgres RPC: message is the code, details is the human sentence.
    if (/^[a-z_]+$/.test(raw) && (FRIENDLY[raw] || error.details)) {
      return new AppError(raw, error.details || FRIENDLY[raw])
    }
    if (error.code === '42501' || /permission denied|row-level security/i.test(raw)) {
      return new AppError('forbidden')
    }
    for (const [pattern, text] of AUTH_MESSAGES) {
      if (pattern.test(raw)) return new AppError(pattern === AUTH_MESSAGES.at(-1)[0] ? 'network' : 'auth', text)
    }
    return new AppError('internal', raw || FRIENDLY.internal)
  }
}

export function errorMessage(error) {
  return AppError.from(error).message
}

export function friendly(code) {
  return FRIENDLY[code] || FRIENDLY.internal
}
