import { describe, expect, it } from 'vitest'
import { createHandler } from '../../supabase/functions/venue-routes/handler.js'
import { createFakeGoogle, createFakeSupabase, envFrom, post } from './fakes.js'

const HANGOUT = '11111111-1111-4111-8111-111111111111'
const GROUP = '22222222-2222-4222-8222-222222222222'
const VENUE = '33333333-3333-4333-8333-333333333333'
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  GOOGLE_MAPS_SERVER_KEY: 'AIzaSyTEST-server-key-000000000000000',
}

function fixtures({ venueName = 'Blue Cafe', rpc = {} } = {}) {
  return createFakeSupabase({
    rpc,
    users: { 'token-alice': { id: ALICE }, 'token-stranger': { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } },
    tables: {
      venues: [
        {
          id: VENUE,
          hangout_id: HANGOUT,
          google_place_id: 'ChIJrefreshed',
          name: venueName,
          latitude: venueName ? 18.55 : null,
          longitude: venueName ? 73.85 : null,
        },
      ],
      hangouts: [{ id: HANGOUT, group_id: GROUP, travel_mode: 'DRIVE', scheduled_for: null }],
      group_members: [
        { group_id: GROUP, user_id: ALICE },
        { group_id: GROUP, user_id: BOB },
      ],
      hangout_locations: [
        { hangout_id: HANGOUT, user_id: ALICE, latitude: 18.59, longitude: 73.73 },
        { hangout_id: HANGOUT, user_id: BOB, latitude: 18.55, longitude: 73.94 },
      ],
      venue_routes: [
        // Alice already has a drawn route; Bob only has the matrix time.
        { venue_id: VENUE, user_id: ALICE, travel_mode: 'DRIVE', travel_time_seconds: 1200, distance_meters: 11000, polyline: 'cached' },
        { venue_id: VENUE, user_id: BOB, travel_mode: 'DRIVE', travel_time_seconds: 1500, distance_meters: 12000, polyline: null },
      ],
    },
  })
}

function handlerFor(supabase, google = createFakeGoogle(), env = ENV) {
  return createHandler({
    env: envFrom(env),
    createClient: supabase.createClient,
    fetch: google.fetch,
    now: () => Date.parse('2026-11-14T12:00:00Z'),
    logger: { error: () => {} },
  })
}

describe('venue-routes handler', () => {
  it('spends the per-user Google quota before computing routes', async () => {
    const supabase = fixtures()
    await handlerFor(supabase)(post({ venueId: VENUE }))
    const quota = supabase.calls.rpc.find((c) => c.name === 'consume_api_quota')
    expect(quota?.args).toMatchObject({ p_user_id: ALICE, p_action: 'venue_routes' })
  })

  it('returns 429 and calls no Google API when the quota is used up', async () => {
    const supabase = fixtures({
      rpc: {
        consume_api_quota: () => ({ data: null, error: { message: 'rate_limited', details: 'Too many attempts. Try again in about 12 minute(s).' } }),
      },
    })
    const google = createFakeGoogle()
    const res = await handlerFor(supabase, google)(post({ venueId: VENUE }))
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('rate_limited')
    expect(google.requests).toHaveLength(0)
  })

  it('requires a session', async () => {
    const res = await handlerFor(fixtures())(post({ venueId: VENUE }, { token: null }))
    expect(res.status).toBe(401)
  })

  it('hides venues from non-members', async () => {
    const res = await handlerFor(fixtures())(post({ venueId: VENUE }, { token: 'token-stranger' }))
    expect(res.status).toBe(404)
  })

  it('computes only missing polylines and keeps the matrix times', async () => {
    const supabase = fixtures()
    const google = createFakeGoogle()
    const res = await handlerFor(supabase, google)(post({ venueId: VENUE }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(google.requests.filter((r) => r.url.includes('computeRoutes'))).toHaveLength(1)
    expect(body.routes).toEqual([
      { userId: ALICE, durationSeconds: 1200, distanceMeters: 11000, polyline: 'cached' },
      { userId: BOB, durationSeconds: 1500, distanceMeters: 12000, polyline: '_p~iF~ps|U_ulLnnqC' },
    ])
    expect(supabase.calls.updates).toEqual([
      expect.objectContaining({ table: 'venue_routes', payload: { polyline: '_p~iF~ps|U_ulLnnqC' } }),
    ])
    expect(body.venue).toBeUndefined()
  })

  it('refreshes purged venue details before routing', async () => {
    const supabase = fixtures({ venueName: null })
    const google = createFakeGoogle()
    const res = await handlerFor(supabase, google)(post({ venueId: VENUE }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.venue).toMatchObject({ name: 'Refreshed Cafe', latitude: 18.55, longitude: 73.85 })
    const details = google.requests.find((r) => r.url.includes('/v1/places/ChIJrefreshed'))
    expect(details.headers['X-Goog-FieldMask']).toContain('displayName')
    expect(details.headers['X-Goog-FieldMask']).not.toContain('places.')
    const venueUpdate = supabase.calls.updates.find((u) => u.table === 'venues')
    expect(venueUpdate.payload.content_expires_at).toBe('2026-12-14T12:00:00.000Z')
  })

  it('reports a missing server key when routes must be computed', async () => {
    const res = await handlerFor(fixtures(), createFakeGoogle(), { ...ENV, GOOGLE_MAPS_SERVER_KEY: undefined })(
      post({ venueId: VENUE }),
    )
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
  })
})
