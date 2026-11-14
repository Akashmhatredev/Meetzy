import { describe, expect, it } from 'vitest'
import { EngineError, roundRobin, runMeetupEngine, searchRadiusFor } from '../../supabase/functions/_shared/engine/pipeline.js'
import { destinationPoint, haversineMeters } from '../../supabase/functions/_shared/engine/geo.js'

// ---------------------------------------------------------------------
// Test doubles. These exist only in tests; production calls Google.
// ---------------------------------------------------------------------
const SPEED_MPS = 10 // ~36 km/h

function fakeMatrix({ fail = () => false, calls = [] } = {}) {
  return async ({ origins, destinations, travelMode }) => {
    calls.push({ origins: origins.length, destinations: destinations.length, travelMode })
    const elements = []
    origins.forEach((o, oi) =>
      destinations.forEach((d, di) => {
        if (fail(oi, di, d)) {
          elements.push({ originIndex: oi, destinationIndex: di, condition: 'ROUTE_NOT_FOUND' })
          return
        }
        const meters = Math.round(haversineMeters(o, d))
        elements.push({
          originIndex: oi,
          destinationIndex: di,
          duration: `${Math.round(meters / SPEED_MPS)}s`,
          distanceMeters: meters,
          condition: 'ROUTE_EXISTS',
        })
      }),
    )
    return elements
  }
}

function place(id, center, bearing, meters, extra = {}) {
  const p = destinationPoint(center, bearing, meters)
  return {
    placeId: id,
    name: `Place ${id}`,
    address: `${id} Road`,
    lat: p.lat,
    lng: p.lng,
    rating: 4.2,
    ratingCount: 120,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    primaryType: 'cafe',
    primaryTypeLabel: 'Cafe',
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    photoName: `places/${id}/photos/p1`,
    photoAttributions: [{ displayName: 'Photographer', uri: 'https://maps.google.com/contrib/1' }],
    openingHours: ['Monday: 9 AM – 9 PM'],
    openNow: true,
    businessStatus: 'OPERATIONAL',
    ...extra,
  }
}

function fakeSearch(byQuery, { calls = [] } = {}) {
  return async ({ textQuery, center, radiusMeters }) => {
    calls.push({ textQuery, center, radiusMeters })
    const make = byQuery[textQuery]
    return typeof make === 'function' ? make(center, calls.length) : []
  }
}

const participants = [
  { userId: 'u1', name: 'Aarav', lat: 18.5913, lng: 73.7389 },
  { userId: 'u2', name: 'Maya', lat: 18.5515, lng: 73.944 },
  { userId: 'u3', name: 'Priya', lat: 18.5074, lng: 73.8077 },
  { userId: 'u4', name: 'Sam', lat: 18.5679, lng: 73.9143 },
]

const activities = [
  { activityId: 'act-cafe', name: 'Cafe', placesQuery: 'cafe' },
  { activityId: 'act-movies', name: 'Movies', placesQuery: 'movie theater' },
]

function standardSearch() {
  return {
    cafe: (c) => [
      place('cafe1', c, 0, 300),
      place('cafe2', c, 90, 800),
      place('shared', c, 180, 500),
      place('closed', c, 45, 200, { businessStatus: 'CLOSED_PERMANENTLY' }),
      place('far', c, 0, 60_000),
    ],
    'movie theater': (c) => [
      place('shared', c, 180, 500),
      place('movie1', c, 270, 1200, { primaryType: 'movie_theater', primaryTypeLabel: 'Movie theater' }),
      place('movie2', c, 300, 2000, { photoName: null }),
    ],
  }
}

const baseInput = { participants, activities, travelMode: 'DRIVE', strategy: 'fair', departureTime: null, maxTravelSeconds: null }

describe('runMeetupEngine', () => {
  it('returns the exact shape public.complete_calculation reads', async () => {
    const result = await runMeetupEngine(baseInput, {
      routeMatrix: fakeMatrix(),
      searchPlaces: fakeSearch(standardSearch()),
      getPhotoUri: async (name) => `https://lh3.googleusercontent.com/${name}`,
    })

    expect(Object.keys(result).sort()).toEqual(
      [
        'activitiesUsed',
        'area',
        'areaExplanation',
        'areas',
        'center',
        'placesFound',
        'routesFailed',
        'routesRequested',
        'venues',
        'venuesConsidered',
        'warnings',
      ].sort(),
    )
    expect(result.center).toEqual({ lat: expect.any(Number), lng: expect.any(Number) })
    expect(result.area).toEqual({ lat: expect.any(Number), lng: expect.any(Number), kind: expect.any(String) })
    expect(result.areas[0]).toEqual(
      expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number), kind: 'centroid', complete: true }),
    )
    expect(result.areas.filter((a) => a.chosen)).toHaveLength(1)
    expect(result.activitiesUsed).toEqual([
      { activityId: 'act-cafe', name: 'Cafe' },
      { activityId: 'act-movies', name: 'Movies' },
    ])

    const venue = result.venues[0]
    expect(Object.keys(venue).sort()).toEqual(
      [
        'activityId',
        'address',
        'businessStatus',
        'distanceFromAreaMeters',
        'explanation',
        'googleMapsUri',
        'lat',
        'lng',
        'name',
        'openNow',
        'openingHours',
        'photoAttributions',
        'photoUri',
        'placeId',
        'priceLevel',
        'primaryType',
        'primaryTypeLabel',
        'rank',
        'rating',
        'ratingCount',
        'routes',
        'summary',
      ].sort(),
    )
    expect(Object.keys(venue.summary).sort()).toEqual(
      ['avg', 'complete', 'max', 'min', 'participants', 'reachable', 'spread', 'total', 'withinLimit'].sort(),
    )
    expect(venue.routes).toHaveLength(4)
    expect(Object.keys(venue.routes[0]).sort()).toEqual(['condition', 'distanceMeters', 'durationSeconds', 'userId'])
    expect(result.venues.map((v) => v.rank)).toEqual(result.venues.map((_, i) => i + 1))
    expect(venue.explanation).toMatch(/Everyone can get here within about \d+ min/)
  })

  it('dedupes places, drops closed and far ones, and keeps the first activity', async () => {
    const result = await runMeetupEngine(baseInput, {
      routeMatrix: fakeMatrix(),
      searchPlaces: fakeSearch(standardSearch()),
    })
    const ids = result.venues.map((v) => v.placeId).sort()
    expect(ids).toEqual(['cafe1', 'cafe2', 'movie1', 'movie2', 'shared'])
    expect(result.venues.find((v) => v.placeId === 'shared').activityId).toBe('act-cafe')
    expect(result.placesFound).toBe(5)
  })

  it('takes venues round-robin across activities', () => {
    expect(roundRobin([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']], 5)).toEqual(['a1', 'b1', 'c1', 'a2', 'c2'])
    expect(roundRobin([[], []], 3)).toEqual([])
  })

  it('ranks venues by real travel time for the strategy', async () => {
    const result = await runMeetupEngine(
      { ...baseInput, strategy: 'fastest' },
      { routeMatrix: fakeMatrix(), searchPlaces: fakeSearch(standardSearch()) },
    )
    const totals = result.venues.map((v) => v.summary.total)
    expect([...totals].sort((a, b) => a - b)).toEqual(totals)
  })

  it('keeps a failed route as missing and ranks that venue last', async () => {
    const io = {
      routeMatrix: async (args) => {
        // Fail only the venue matrix, for Priya to the closest cafe.
        const isVenueCall = args.destinations.length === 5
        return fakeMatrix({
          fail: (oi, di, d) => isVenueCall && oi === 2 && haversineMeters(d, args.destinations[0]) < 1,
        })(args)
      },
      searchPlaces: fakeSearch(standardSearch()),
    }
    const result = await runMeetupEngine(baseInput, io)
    const last = result.venues.at(-1)
    expect(last.placeId).toBe('cafe1')
    expect(last.summary.complete).toBe(false)
    expect(last.summary.reachable).toBe(3)
    expect(last.routes.find((r) => r.userId === 'u3')).toEqual({
      userId: 'u3',
      durationSeconds: null,
      distanceMeters: null,
      condition: 'ROUTE_NOT_FOUND',
    })
    expect(last.explanation).toContain('No route was found for Priya, so this is based on 3 of 4 friends.')
    expect(result.routesFailed).toBe(1)
  })

  it('retries around the next-best area when the first search finds nothing', async () => {
    const searchCalls = []
    let first = null
    const search = fakeSearch(
      {
        cafe: (c) => {
          first ??= c
          return c === first ? [] : [place('late-cafe', c, 0, 200)]
        },
        'movie theater': () => [],
      },
      { calls: searchCalls },
    )
    const result = await runMeetupEngine(baseInput, { routeMatrix: fakeMatrix(), searchPlaces: search })
    expect(result.venues.map((v) => v.placeId)).toEqual(['late-cafe'])
    expect(result.warnings.join(' ')).toContain('next-best area')
    expect(searchCalls).toHaveLength(4)
    const chosen = result.areas.find((a) => a.chosen)
    expect(haversineMeters(chosen, first)).toBeGreaterThan(1)
  })

  it('fails with no_venues when nothing matches anywhere', async () => {
    await expect(
      runMeetupEngine(baseInput, { routeMatrix: fakeMatrix(), searchPlaces: async () => [] }),
    ).rejects.toMatchObject({ code: 'no_venues' })
  })

  it('fails with no_routes when Google finds no route to any area', async () => {
    await expect(
      runMeetupEngine(baseInput, {
        routeMatrix: fakeMatrix({ fail: () => true }),
        searchPlaces: fakeSearch(standardSearch()),
      }),
    ).rejects.toMatchObject({ code: 'no_routes' })
  })

  it('validates participants and activities', async () => {
    const io = { routeMatrix: fakeMatrix(), searchPlaces: fakeSearch(standardSearch()) }
    await expect(runMeetupEngine({ ...baseInput, participants: participants.slice(0, 1) }, io)).rejects.toBeInstanceOf(
      EngineError,
    )
    await expect(runMeetupEngine({ ...baseInput, participants: participants.slice(0, 1) }, io)).rejects.toMatchObject({
      code: 'not_enough_locations',
    })
    const many = Array.from({ length: 26 }, (_, i) => ({ userId: `p${i}`, lat: 18.5 + i * 0.001, lng: 73.8 }))
    await expect(runMeetupEngine({ ...baseInput, participants: many }, io)).rejects.toMatchObject({
      code: 'too_many_participants',
    })
    await expect(runMeetupEngine({ ...baseInput, activities: [] }, io)).rejects.toMatchObject({ code: 'no_activities' })
    const bad = [...participants.slice(0, 1), { userId: 'x', lat: 200, lng: 0 }]
    await expect(runMeetupEngine({ ...baseInput, participants: bad }, io)).rejects.toMatchObject({
      code: 'not_enough_locations',
    })
  })

  it('stays inside the TRANSIT element budget', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      userId: `p${i}`,
      name: `P${i}`,
      lat: 18.45 + (i % 4) * 0.04,
      lng: 73.75 + Math.floor(i / 4) * 0.06,
    }))
    const many = {
      cafe: (c) => Array.from({ length: 10 }, (_, i) => place(`c${i}`, c, i * 36, 300 + i * 100)),
      'movie theater': (c) => Array.from({ length: 10 }, (_, i) => place(`m${i}`, c, i * 36 + 18, 400 + i * 100)),
    }
    const calls = []
    const result = await runMeetupEngine(
      { ...baseInput, participants: twelve, travelMode: 'TRANSIT' },
      { routeMatrix: fakeMatrix({ calls }), searchPlaces: fakeSearch(many) },
    )
    for (const call of calls) expect(call.origins * call.destinations).toBeLessThanOrEqual(100)
    expect(result.venues).toHaveLength(8) // floor(100 / 12)
    expect(new Set(result.venues.map((v) => v.activityId)).size).toBe(2)
  })

  it('uses up to 25 venues for driving', async () => {
    const many = {
      cafe: (c) => Array.from({ length: 10 }, (_, i) => place(`c${i}`, c, i * 36, 300 + i * 100)),
      'movie theater': (c) => Array.from({ length: 10 }, (_, i) => place(`m${i}`, c, i * 36 + 18, 400 + i * 100)),
    }
    const result = await runMeetupEngine(baseInput, { routeMatrix: fakeMatrix(), searchPlaces: fakeSearch(many) })
    expect(result.venues).toHaveLength(20)
    expect(result.routesRequested).toBe(4 * result.areas.length + 4 * 20)
  })

  it('ignores photo lookup failures and only fetches photos for the top venues', async () => {
    const asked = []
    const result = await runMeetupEngine(baseInput, {
      routeMatrix: fakeMatrix(),
      searchPlaces: fakeSearch(standardSearch()),
      getPhotoUri: async (name) => {
        asked.push(name)
        if (name.includes('cafe2')) throw new Error('photo quota')
        return `https://lh3.googleusercontent.com/${name}`
      },
    })
    expect(asked.length).toBeLessThanOrEqual(8)
    expect(result.venues.find((v) => v.placeId === 'cafe2').photoUri).toBeNull()
    expect(result.venues.find((v) => v.placeId === 'cafe2').photoAttributions).toEqual([])
    expect(result.venues.find((v) => v.placeId === 'cafe1').photoUri).toContain('googleusercontent')
    expect(result.venues.find((v) => v.placeId === 'movie2').photoUri).toBeNull()
  })

  it('searches with a radius derived from the group spread', async () => {
    const calls = []
    await runMeetupEngine(baseInput, { routeMatrix: fakeMatrix(), searchPlaces: fakeSearch(standardSearch(), { calls }) })
    expect(calls[0].radiusMeters).toBeGreaterThanOrEqual(1500)
    expect(calls[0].radiusMeters).toBeLessThanOrEqual(6000)
    expect(searchRadiusFor(100)).toBe(1500)
    expect(searchRadiusFor(1e6)).toBe(6000)
  })

  it('flags venues over the max travel time', async () => {
    const result = await runMeetupEngine(
      { ...baseInput, maxTravelSeconds: 60 },
      { routeMatrix: fakeMatrix(), searchPlaces: fakeSearch(standardSearch()) },
    )
    expect(result.venues.every((v) => v.summary.withinLimit === false)).toBe(true)
    expect(result.venues[0].explanation).toContain('limit')
  })
})
