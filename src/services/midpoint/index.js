/**
 * Client for the midpoint engine. The engine itself runs in the
 * `compute-meetup` Supabase Edge Function (server-side Google key); the
 * browser only asks for a run and then reads results from the database.
 *
 * Ranking helpers are re-exported from the same pure module the function
 * uses, so re-sorting by strategy in the UI never calls Google again.
 */
import { supabase } from '@/services/supabase/client'
import { AppError } from '@/utils/errors'

export {
  STRATEGIES,
  rankVenues,
  sortVenues,
  summaryOf,
  bestBalancedId,
} from '@engine/ranking.js'
export { formatMinutes } from '@engine/explain.js'

async function invoke(name, body) {
  let result
  try {
    result = await supabase().functions.invoke(name, { body })
  } catch (error) {
    throw AppError.from(error)
  }
  const { data, error } = result
  if (!error) {
    if (data && data.ok === false) throw new AppError(data.error?.code || 'internal', data.error?.message)
    return data
  }
  // FunctionsHttpError keeps the Response in error.context.
  const response = error.context
  if (response && typeof response.json === 'function') {
    const payload = await response.json().catch(() => null)
    if (payload?.error) throw new AppError(payload.error.code || 'internal', payload.error.message)
  }
  if (/fetch|network/i.test(error.message || '')) throw new AppError('network')
  throw new AppError('internal', error.message)
}

/** Run (or reuse a cached run of) the meeting-point optimisation. */
export function computeMeetup(hangoutId, { force = false } = {}) {
  return invoke('compute-meetup', { hangoutId, force })
}

/** Per-member route polylines to one venue; `refresh` re-fetches expired Place details. */
export function fetchVenueRoutes(venueId, { refresh = false } = {}) {
  return invoke('venue-routes', { venueId, refresh })
}
