import { describe, expect, it } from 'vitest'
import { buildInputHash, createHandler } from '../../supabase/functions/compute-meetup/handler.js'
import { createFakeGoogle, createFakeSupabase, envFrom, post } from './fakes.js'

const HANGOUT = '11111111-1111-4111-8111-111111111111'
const GROUP = '22222222-2222-4222-8222-222222222222'
const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CARA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CAFE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SERVER_KEY = 'AIzaSyTEST-server-key-000000000000000'

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  GOOGLE_MAPS_SERVER_KEY: SERVER_KEY,
}

function fixtures({ locations = 3, rpc = {} } = {}) {
  const tables = {
    hangouts: [
      {
        id: HANGOUT,
        group_id: GROUP,
        status: 'activity_selection',
        travel_mode: 'DRIVE',
        optimization_strategy: 'fair',
        activity_mode: 'all_selected',
        max_travel_minutes: null,
        scheduled_for: null,
      },
    ],
    group_members: [
      { group_id: GROUP, user_id: ALICE },
      { group_id: GROUP, user_id: BOB },
      { group_id: GROUP, user_id: CARA },
    ],
    hangout_locations: [
      { hangout_id: HANGOUT, user_id: ALICE, latitude: 18.5913, longitude: 73.7389, profile: { full_name: 'Alice Rao' } },
      { hangout_id: HANGOUT, user_id: BOB, latitude: 18.5515, longitude: 73.944, profile: { full_name: 'Bob' } },
      { hangout_id: HANGOUT, user_id: CARA, latitude: 18.5074, longitude: 73.8077, profile: { full_name: null } },
    ].slice(0, locations),
    hangout_activities: [{ hangout_id: HANGOUT, activity_id: CAFE, activity: { id: CAFE, name: 'Cafe', places_query: 'cafe' } }],
    activity_votes: [
      { hangout_id: HANGOUT, activity_id: CAFE },
      { hangout_id: HANGOUT, activity_id: CAFE },
    ],
  }
  const supabase = createFakeSupabase({
    tables,
    users: { 'token-alice': { id: ALICE }, 'token-stranger': { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } },
    rpc: {
      start_calculation: () => ({ data: { cached: false, run_id: 'run-1' }, error: null }),
      complete_calculation: ({ p_result }) => ({ data: { venue_count: p_result.venues.length }, error: null }),
      fail_calculation: () => ({ data: null, error: null }),
      ...rpc,
    },
  })
  return supabase
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

async function read(response) {
  return { status: response.status, body: await response.json(), headers: response.headers }
}

describe('compute-meetup handler', () => {
  it('answers CORS preflight', async () => {
    const res = await handlerFor(fixtures())(post(null, { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
  })

  it('restricts CORS to ALLOWED_ORIGINS when set', async () => {
    const supabase = fixtures()
    const handler = handlerFor(supabase, createFakeGoogle(), { ...ENV, ALLOWED_ORIGINS: 'https://meetzy.app, http://localhost:5190' })
    const res = await handler(post(null, { method: 'OPTIONS', origin: 'http://localhost:5190' }))
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5190')
    const other = await handler(post(null, { method: 'OPTIONS', origin: 'https://evil.example' }))
    expect(other.headers.get('access-control-allow-origin')).toBe('https://meetzy.app')
  })

  it('rejects other methods', async () => {
    const res = await read(await handlerFor(fixtures())(post(null, { method: 'GET' })))
    expect(res.status).toBe(405)
  })

  it('returns 401 without a valid session', async () => {
    const supabase = fixtures()
    const none = await read(await handlerFor(supabase)(post({ hangoutId: HANGOUT }, { token: null })))
    expect(none.status).toBe(401)
    expect(none.body).toEqual({ ok: false, error: { code: 'unauthorized', message: expect.any(String) } })
    const bad = await read(await handlerFor(supabase)(post({ hangoutId: HANGOUT }, { token: 'forged' })))
    expect(bad.status).toBe(401)
  })

  it('returns 503 when the Google server key is missing', async () => {
    const supabase = fixtures()
    const res = await read(
      await handlerFor(supabase, createFakeGoogle(), { ...ENV, GOOGLE_MAPS_SERVER_KEY: '' })(post({ hangoutId: HANGOUT })),
    )
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('not_configured')
    expect(supabase.calls.rpc).toHaveLength(0)
  })

  it('validates the body', async () => {
    const res = await read(await handlerFor(fixtures())(post({ hangoutId: 'nope' })))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('hides hangouts from non-members', async () => {
    const res = await read(await handlerFor(fixtures())(post({ hangoutId: HANGOUT }, { token: 'token-stranger' })))
    expect(res.status).toBe(404)
  })

  it('needs at least two shared locations before starting a run', async () => {
    const supabase = fixtures({ locations: 1 })
    const res = await read(await handlerFor(supabase)(post({ hangoutId: HANGOUT })))
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('not_enough_locations')
    expect(supabase.calls.rpc).toHaveLength(0)
  })

  it('returns a cached run without calling Google', async () => {
    const supabase = fixtures({
      rpc: { start_calculation: () => ({ data: { cached: true, run_id: 'run-old' }, error: null }) },
    })
    const google = createFakeGoogle()
    const res = await read(await handlerFor(supabase, google)(post({ hangoutId: HANGOUT })))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, cached: true, runId: 'run-old' })
    expect(google.requests).toHaveLength(0)
  })

  it('runs the engine and stores the result', async () => {
    const supabase = fixtures()
    const google = createFakeGoogle()
    const res = await read(await handlerFor(supabase, google)(post({ hangoutId: HANGOUT, force: true })))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, cached: false, runId: 'run-1', venueCount: 3, warnings: [] })

    const start = supabase.calls.rpc.find((c) => c.name === 'start_calculation')
    expect(start.args).toMatchObject({ p_hangout_id: HANGOUT, p_user_id: ALICE, p_force: true, p_participant_count: 3 })
    expect(start.args.p_input_hash).toMatch(/^[0-9a-f]{64}$/)

    const complete = supabase.calls.rpc.find((c) => c.name === 'complete_calculation')
    expect(complete.args.p_run_id).toBe('run-1')
    const result = complete.args.p_result
    expect(result.venues).toHaveLength(3)
    expect(result.venues[0].routes.map((r) => r.userId).sort()).toEqual([ALICE, BOB, CARA].sort())
    expect(result.venues[0].photoUri).toBe('https://lh3.googleusercontent.com/fake-photo')
    expect(result.activitiesUsed).toEqual([{ activityId: CAFE, name: 'Cafe' }])
    expect(supabase.calls.rpc.some((c) => c.name === 'fail_calculation')).toBe(false)

    // Google is called with the server key in a header, never in a URL,
    // and with traffic-aware routing for driving.
    const matrix = google.requests.find((r) => r.url.includes('computeRouteMatrix'))
    expect(matrix.headers['X-Goog-Api-Key']).toBe(SERVER_KEY)
    expect(matrix.headers['X-Goog-FieldMask']).toBe('originIndex,destinationIndex,duration,distanceMeters,status,condition')
    expect(matrix.body.routingPreference).toBe('TRAFFIC_AWARE')
    expect(matrix.body.departureTime).toBeUndefined()
    expect(google.requests.every((r) => !r.url.includes(SERVER_KEY))).toBe(true)
    const search = google.requests.find((r) => r.url.endsWith('places:searchText'))
    expect(search.body).toMatchObject({ textQuery: 'cafe', pageSize: 10 })
    expect(search.headers['X-Goog-FieldMask']).toContain('places.id')
  })

  it('sends a future departure time and no traffic preference for transit', async () => {
    const supabase = fixtures()
    supabase.tables.hangouts[0].travel_mode = 'TRANSIT'
    supabase.tables.hangouts[0].scheduled_for = '2026-11-15T18:30:00Z'
    const google = createFakeGoogle()
    const res = await handlerFor(supabase, google)(post({ hangoutId: HANGOUT }))
    expect(res.status).toBe(200)
    const matrix = google.requests.find((r) => r.url.includes('computeRouteMatrix'))
    expect(matrix.body.travelMode).toBe('TRANSIT')
    expect(matrix.body.routingPreference).toBeUndefined()
    expect(matrix.body.departureTime).toBe('2026-11-15T18:30:00.000Z')
  })

  it('records a failed run and hides Google error details', async () => {
    const supabase = fixtures()
    const google = createFakeGoogle({
      failMatrix: {
        status: 403,
        body: { error: { code: 403, status: 'PERMISSION_DENIED', message: `API key ${SERVER_KEY} not authorized` } },
      },
    })
    const res = await read(await handlerFor(supabase, google)(post({ hangoutId: HANGOUT })))
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('google_error')
    expect(JSON.stringify(res.body)).not.toContain(SERVER_KEY)
    const fail = supabase.calls.rpc.find((c) => c.name === 'fail_calculation')
    expect(fail.args).toMatchObject({ p_run_id: 'run-1', p_code: 'google_error' })
    expect(fail.args.p_message).not.toContain(SERVER_KEY)
  })

  it('maps database errors from start_calculation', async () => {
    const limited = fixtures({
      rpc: {
        start_calculation: () => ({
          data: null,
          error: { message: 'rate_limited', details: 'Too many attempts. Try again in about 12 minute(s).' },
        }),
      },
    })
    const res = await read(await handlerFor(limited)(post({ hangoutId: HANGOUT })))
    expect(res.status).toBe(429)
    expect(res.body.error).toEqual({ code: 'rate_limited', message: 'Too many attempts. Try again in about 12 minute(s).' })

    const running = fixtures({
      rpc: { start_calculation: () => ({ data: null, error: { message: 'already_running', details: 'Busy.' } }) },
    })
    expect((await handlerFor(running)(post({ hangoutId: HANGOUT }))).status).toBe(409)

    const weird = fixtures({
      rpc: { start_calculation: () => ({ data: null, error: { message: 'relation "x" does not exist' } }) },
    })
    const internal = await read(await handlerFor(weird)(post({ hangoutId: HANGOUT })))
    expect(internal.status).toBe(500)
    expect(internal.body.error.message).not.toContain('relation')
  })

  it('refuses closed hangouts', async () => {
    const supabase = fixtures()
    supabase.tables.hangouts[0].status = 'finalized'
    const res = await read(await handlerFor(supabase)(post({ hangoutId: HANGOUT })))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('hangout_closed')
  })

  it('needs at least one activity', async () => {
    const supabase = fixtures()
    supabase.tables.hangout_activities.length = 0
    const res = await read(await handlerFor(supabase)(post({ hangoutId: HANGOUT })))
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('no_activities')
  })
})

describe('input hash', () => {
  const base = {
    participants: [
      { userId: 'b', lat: 18.123456789, lng: 73.1 },
      { userId: 'a', lat: 18.2, lng: 73.2 },
    ],
    activities: [{ activityId: 'x' }, { activityId: 'y' }],
    travelMode: 'DRIVE',
    strategy: 'fair',
    departureTime: null,
    maxTravelSeconds: null,
  }

  it('ignores order and sub-metre jitter', async () => {
    const h1 = await buildInputHash(base)
    const h2 = await buildInputHash({
      ...base,
      participants: [
        { userId: 'a', lat: 18.2, lng: 73.2 },
        { userId: 'b', lat: 18.1234571, lng: 73.1 },
      ],
      activities: [{ activityId: 'y' }, { activityId: 'x' }],
    })
    expect(h1).toBe(h2)
  })

  it('changes when an input that affects results changes', async () => {
    const h1 = await buildInputHash(base)
    expect(await buildInputHash({ ...base, travelMode: 'WALK' })).not.toBe(h1)
    expect(await buildInputHash({ ...base, strategy: 'balanced' })).not.toBe(h1)
    expect(await buildInputHash({ ...base, maxTravelSeconds: 1800 })).not.toBe(h1)
    expect(await buildInputHash({ ...base, participants: [{ ...base.participants[0], lat: 18.2 }, base.participants[1]] })).not.toBe(h1)
  })
})
