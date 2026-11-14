/**
 * venue-routes: per-member route polylines to one venue, plus an optional
 * refresh of the venue's Google details.
 *
 * POST { venueId: uuid, refresh?: boolean }
 * Authorization: Bearer <user access token>
 *
 * Polylines are computed once per member (Routes API computeRoutes) and
 * cached on venue_routes; they are purged with the rest of the Google
 * content after 30 days. Details are refetched when asked to, or when the
 * cached content was purged (finalised plans keep only the place ID).
 */
import { EngineError } from '../_shared/engine/errors.js'
import { computeRoute } from '../_shared/google/routes.js'
import { getPlaceDetails } from '../_shared/google/places.js'
import {
  authenticate,
  corsHeaders,
  errorInfo,
  errorResponse,
  isUuid,
  json,
  preflight,
  unwrap,
} from '../_shared/http.js'

const MAX_ROUTES = 25
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000
// Google-spending requests per user per hour (cached polylines are free).
const QUOTA = { action: 'venue_routes', max: 40, windowSeconds: 3600 }

export function createHandler({ env, createClient, fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), logger = console }) {
  return async function handle(req) {
    const cors = corsHeaders(req.headers.get('origin'), env)
    if (req.method === 'OPTIONS') return preflight(cors)
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST.', cors)

    const supabaseUrl = env('SUPABASE_URL')
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return errorResponse(503, 'not_configured', 'The Supabase service credentials are not configured.', cors)
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const user = await authenticate(admin, req)
    if (!user) return errorResponse(401, 'unauthorized', 'Please sign in again.', cors)
    const googleKey = env('GOOGLE_MAPS_SERVER_KEY')

    let body
    try {
      body = await req.json()
    } catch {
      return errorResponse(400, 'invalid_request', 'Send a JSON body.', cors)
    }
    const venueId = body?.venueId
    if (!isUuid(venueId)) return errorResponse(400, 'invalid_request', 'venueId must be a UUID.', cors)

    try {
      let venue = unwrap(
        await admin
          .from('venues')
          .select('id, hangout_id, google_place_id, name, latitude, longitude')
          .eq('id', venueId)
          .maybeSingle(),
      )
      if (!venue) return errorResponse(404, 'not_found', 'Venue not found.', cors)

      const hangout = unwrap(
        await admin
          .from('hangouts')
          .select('id, group_id, travel_mode, scheduled_for')
          .eq('id', venue.hangout_id)
          .maybeSingle(),
      )
      const membership = hangout
        ? unwrap(
            await admin
              .from('group_members')
              .select('user_id')
              .eq('group_id', hangout.group_id)
              .eq('user_id', user.id)
              .maybeSingle(),
          )
        : null
      if (!membership) return errorResponse(404, 'not_found', 'Venue not found.', cors)

      const nowMs = now()
      let refreshed = null
      let quotaSpent = false
      const spendQuota = async () => {
        if (quotaSpent) return
        quotaSpent = true
        unwrap(
          await admin.rpc('consume_api_quota', {
            p_user_id: user.id,
            p_action: QUOTA.action,
            p_max: QUOTA.max,
            p_window_seconds: QUOTA.windowSeconds,
          }),
        )
      }
      if (body?.refresh === true || venue.name == null || venue.latitude == null) {
        if (!googleKey) {
          throw new EngineError('not_configured', 'GOOGLE_MAPS_SERVER_KEY is not set for this Edge Function.', 503)
        }
        await spendQuota()
        const details = await getPlaceDetails({ apiKey: googleKey, fetch: fetchImpl, placeId: venue.google_place_id })
        if (!details) throw new EngineError('not_found', 'Google no longer has details for this place.', 404)
        refreshed = unwrap(
          await admin
            .from('venues')
            .update({
              name: details.name,
              address: details.address,
              latitude: details.lat,
              longitude: details.lng,
              rating: details.rating,
              rating_count: details.ratingCount,
              price_level: details.priceLevel,
              primary_type: details.primaryType,
              primary_type_label: details.primaryTypeLabel,
              google_maps_uri: details.googleMapsUri,
              opening_hours: details.openingHours,
              open_now: details.openNow,
              business_status: details.businessStatus,
              content_expires_at: new Date(nowMs + THIRTY_DAYS_MS).toISOString(),
            })
            .eq('id', venue.id)
            .select('*')
            .maybeSingle(),
        )
        venue = { ...venue, ...(refreshed ?? {}), latitude: details.lat, longitude: details.lng }
      }
      if (!Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)) {
        throw new EngineError('not_found', 'This venue has no location to route to.', 404)
      }

      const locations =
        unwrap(
          await admin
            .from('hangout_locations')
            .select('user_id, latitude, longitude')
            .eq('hangout_id', venue.hangout_id)
            .limit(MAX_ROUTES),
        ) ?? []
      const existing =
        unwrap(
          await admin
            .from('venue_routes')
            .select('user_id, travel_mode, travel_time_seconds, distance_meters, polyline')
            .eq('venue_id', venue.id),
        ) ?? []
      const byUser = new Map(existing.map((r) => [r.user_id, r]))

      const departureTime =
        hangout.scheduled_for && Date.parse(hangout.scheduled_for) > nowMs ? hangout.scheduled_for : null
      const destination = { lat: venue.latitude, lng: venue.longitude }

      const todo = locations.filter((l) => {
        const row = byUser.get(l.user_id)
        return !(row?.polyline && row.travel_mode === hangout.travel_mode)
      })
      if (todo.length && !googleKey) {
        throw new EngineError('not_configured', 'GOOGLE_MAPS_SERVER_KEY is not set for this Edge Function.', 503)
      }

      if (todo.length) await spendQuota()
      const settled = await Promise.allSettled(
        todo.map((l) =>
          computeRoute({
            apiKey: googleKey,
            fetch: fetchImpl,
            origin: { lat: Number(l.latitude), lng: Number(l.longitude) },
            destination,
            travelMode: hangout.travel_mode,
            departureTime,
            now: nowMs,
          }),
        ),
      )

      const computed = new Map()
      const failures = settled.filter((r) => r.status === 'rejected')
      if (todo.length && failures.length === todo.length) throw failures[0].reason

      for (let i = 0; i < todo.length; i++) {
        const result = settled[i]
        if (result.status !== 'fulfilled' || !result.value?.polyline) continue
        const userId = todo[i].user_id
        const route = result.value
        computed.set(userId, route)
        const prior = byUser.get(userId)
        if (prior && prior.travel_mode === hangout.travel_mode) {
          // Keep the matrix time the ranking used; only add the drawing.
          unwrap(
            await admin.from('venue_routes').update({ polyline: route.polyline }).eq('venue_id', venue.id).eq('user_id', userId),
          )
        } else {
          unwrap(
            await admin.from('venue_routes').upsert(
              {
                venue_id: venue.id,
                hangout_id: venue.hangout_id,
                user_id: userId,
                travel_mode: hangout.travel_mode,
                travel_time_seconds: route.durationSeconds,
                distance_meters: route.distanceMeters,
                condition: 'ROUTE_EXISTS',
                polyline: route.polyline,
              },
              { onConflict: 'venue_id,user_id' },
            ),
          )
        }
      }

      const routes = locations.map((l) => {
        const prior = byUser.get(l.user_id)
        const fresh = computed.get(l.user_id)
        const sameMode = prior && prior.travel_mode === hangout.travel_mode
        return {
          userId: l.user_id,
          durationSeconds: sameMode && prior.travel_time_seconds != null ? prior.travel_time_seconds : (fresh?.durationSeconds ?? null),
          distanceMeters: sameMode && prior.distance_meters != null ? prior.distance_meters : (fresh?.distanceMeters ?? null),
          polyline: fresh?.polyline ?? (sameMode ? prior.polyline : null) ?? null,
        }
      })

      const payload = { ok: true, routes }
      if (refreshed) payload.venue = refreshed
      return json(200, payload, cors)
    } catch (err) {
      const info = errorInfo(err)
      if (info.status >= 500) {
        logger.error?.(`venue-routes ${info.code}${err?.googleStatus ? ` (${err.googleStatus})` : ''}`)
      }
      return errorResponse(info.status, info.code, info.message, cors)
    }
  }
}
