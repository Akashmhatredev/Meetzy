/**
 * compute-meetup: runs the Meetzy midpoint engine for one hangout.
 *
 * POST { hangoutId: uuid, force?: boolean }
 * Authorization: Bearer <user access token>
 *
 * The caller must belong to the hangout's group. Participant locations,
 * activities and settings are read with the service role, the run is
 * registered (cache check + rate limit) by public.start_calculation, the
 * engine calls Google with the server key, and the results are stored by
 * public.complete_calculation. Members read them through RLS and Realtime.
 */
import { pickActivities } from '../_shared/engine/activities.js'
import { sha256Hex, stableStringify } from '../_shared/engine/hash.js'
import { EngineError, runMeetupEngine } from '../_shared/engine/pipeline.js'
import { computeRouteMatrix } from '../_shared/google/routes.js'
import { getPhotoUri, searchText } from '../_shared/google/places.js'
import {
  authenticate,
  corsHeaders,
  DbError,
  errorInfo,
  errorResponse,
  firstName,
  isUuid,
  json,
  preflight,
  unwrap,
} from '../_shared/http.js'

const FIFTEEN_MINUTES = 15 * 60 * 1000

function round5(value) {
  return Math.round(value * 1e5) / 1e5
}

function futureIso(value, nowMs) {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) && t > nowMs ? new Date(t).toISOString() : null
}

export async function buildInputHash({ participants, activities, travelMode, strategy, departureTime, maxTravelSeconds }) {
  const payload = {
    v: 1,
    participants: [...participants]
      .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
      .map((p) => [p.userId, round5(p.lat), round5(p.lng)]),
    activities: activities.map((a) => a.activityId).sort(),
    travelMode,
    strategy,
    departure: departureTime ? Math.floor(Date.parse(departureTime) / FIFTEEN_MINUTES) : 'now',
    maxTravelSeconds: maxTravelSeconds ?? null,
  }
  return sha256Hex(stableStringify(payload))
}

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
    if (!googleKey) {
      return errorResponse(
        503,
        'not_configured',
        'GOOGLE_MAPS_SERVER_KEY is not set for this Edge Function, so Meetzy cannot look up real routes or venues yet.',
        cors,
      )
    }

    let body
    try {
      body = await req.json()
    } catch {
      return errorResponse(400, 'invalid_request', 'Send a JSON body.', cors)
    }
    const hangoutId = body?.hangoutId
    if (!isUuid(hangoutId)) return errorResponse(400, 'invalid_request', 'hangoutId must be a UUID.', cors)
    const force = body?.force === true

    let runId = null
    try {
      const hangout = unwrap(
        await admin
          .from('hangouts')
          .select('id, group_id, status, travel_mode, optimization_strategy, activity_mode, max_travel_minutes, scheduled_for')
          .eq('id', hangoutId)
          .maybeSingle(),
      )
      if (!hangout) return errorResponse(404, 'not_found', null, cors)

      const membership = unwrap(
        await admin
          .from('group_members')
          .select('user_id')
          .eq('group_id', hangout.group_id)
          .eq('user_id', user.id)
          .maybeSingle(),
      )
      // Non-members learn nothing about whether the hangout exists.
      if (!membership) return errorResponse(404, 'not_found', null, cors)
      if (hangout.status === 'finalized' || hangout.status === 'cancelled') {
        return errorResponse(409, 'hangout_closed', 'This hangout is closed. Reopen it to recalculate.', cors)
      }

      const locations =
        unwrap(
          await admin
            .from('hangout_locations')
            .select('user_id, latitude, longitude, profile:profiles(full_name)')
            .eq('hangout_id', hangoutId),
        ) ?? []
      const participants = locations.map((l) => ({
        userId: l.user_id,
        name: firstName(l.profile?.full_name) ?? 'A friend',
        lat: Number(l.latitude),
        lng: Number(l.longitude),
      }))
      if (participants.length < 2) {
        throw new EngineError('not_enough_locations', 'At least two friends need to share a location first.')
      }

      const shortlist =
        unwrap(
          await admin
            .from('hangout_activities')
            .select('activity_id, activity:activities(id, name, places_query)')
            .eq('hangout_id', hangoutId),
        ) ?? []
      const votes = unwrap(await admin.from('activity_votes').select('activity_id').eq('hangout_id', hangoutId)) ?? []
      const voteCounts = new Map()
      for (const v of votes) voteCounts.set(v.activity_id, (voteCounts.get(v.activity_id) ?? 0) + 1)
      const activities = pickActivities(
        shortlist.map((row) => ({
          activityId: row.activity_id,
          name: row.activity?.name ?? 'Activity',
          placesQuery: row.activity?.places_query ?? '',
          votes: voteCounts.get(row.activity_id) ?? 0,
        })),
        hangout.activity_mode,
      )
      if (!activities.length) throw new EngineError('no_activities', 'Pick at least one activity first.')

      const nowMs = now()
      const input = {
        participants,
        activities: activities.map(({ activityId, name, placesQuery }) => ({ activityId, name, placesQuery })),
        travelMode: hangout.travel_mode,
        strategy: hangout.optimization_strategy,
        departureTime: futureIso(hangout.scheduled_for, nowMs),
        maxTravelSeconds: hangout.max_travel_minutes ? hangout.max_travel_minutes * 60 : null,
      }
      const inputHash = await buildInputHash(input)

      const start = unwrap(
        await admin.rpc('start_calculation', {
          p_hangout_id: hangoutId,
          p_user_id: user.id,
          p_input_hash: inputHash,
          p_force: force,
          p_participant_count: participants.length,
        }),
      )
      if (start?.cached) {
        return json(200, { ok: true, cached: true, runId: start.run_id }, cors)
      }
      runId = start?.run_id
      if (!runId) throw new Error('start_calculation returned no run id')

      const io = {
        routeMatrix: (args) => computeRouteMatrix({ apiKey: googleKey, fetch: fetchImpl, now: nowMs, ...args }),
        searchPlaces: ({ textQuery, center, radiusMeters }) =>
          searchText({ apiKey: googleKey, fetch: fetchImpl, textQuery, center, radiusMeters }),
        getPhotoUri: (photoName) => getPhotoUri({ apiKey: googleKey, fetch: fetchImpl, photoName }),
      }
      const result = await runMeetupEngine(input, io)

      const done = unwrap(await admin.rpc('complete_calculation', { p_run_id: runId, p_result: result }))
      return json(
        200,
        {
          ok: true,
          cached: false,
          runId,
          venueCount: done?.venue_count ?? result.venues.length,
          area: { lat: result.area.lat, lng: result.area.lng },
          warnings: result.warnings,
        },
        cors,
      )
    } catch (err) {
      const info = errorInfo(err)
      if (runId) {
        try {
          await admin.rpc('fail_calculation', { p_run_id: runId, p_code: info.code, p_message: info.message })
        } catch {
          // The run times out on its own after two minutes.
        }
      }
      // Log codes only, never coordinates or tokens.
      if (info.status >= 500) {
        logger.error?.(
          `compute-meetup ${info.code}${err?.googleStatus ? ` (${err.googleStatus})` : ''}${
            err instanceof DbError ? ` db:${err.dbError?.code ?? ''}` : ''
          }${info.code === 'internal' ? `: ${String(err?.message ?? err).slice(0, 200)}` : ''}`,
        )
      }
      return errorResponse(info.status, info.code, info.message, cors)
    }
  }
}
