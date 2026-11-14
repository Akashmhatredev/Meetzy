import { describe, expect, it } from 'vitest'
import {
  destinationPoint,
  geometricMedian,
  haversineMeters,
  maxDistanceFrom,
  sphericalCentroid,
  toRadians,
} from '../../supabase/functions/_shared/engine/geo.js'
import { buildCandidateAreas, ringRadiusFor } from '../../supabase/functions/_shared/engine/candidates.js'
import { buildTimeTable, elementLimit, parseDurationSeconds, routingPreferenceFor } from '../../supabase/functions/_shared/engine/matrix.js'
import { pickActivities } from '../../supabase/functions/_shared/engine/activities.js'
import { sha256Hex, stableStringify } from '../../supabase/functions/_shared/engine/hash.js'

const pune = {
  hinjewadi: { lat: 18.5913, lng: 73.7389 },
  kharadi: { lat: 18.5515, lng: 73.944 },
  kothrud: { lat: 18.5074, lng: 73.8077 },
  vimanNagar: { lat: 18.5679, lng: 73.9143 },
}

describe('geo', () => {
  it('converts degrees to radians', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI)
  })

  it('measures great-circle distance', () => {
    // Pune to Mumbai is roughly 120 km as the crow flies.
    const d = haversineMeters({ lat: 18.5204, lng: 73.8567 }, { lat: 19.076, lng: 72.8777 })
    expect(d).toBeGreaterThan(115_000)
    expect(d).toBeLessThan(125_000)
    expect(haversineMeters(pune.kothrud, pune.kothrud)).toBe(0)
  })

  it('finds the spherical centroid, including across the antimeridian', () => {
    const c = sphericalCentroid([
      { lat: 0, lng: 10 },
      { lat: 0, lng: -10 },
    ])
    expect(c.lat).toBeCloseTo(0)
    expect(c.lng).toBeCloseTo(0)

    const across = sphericalCentroid([
      { lat: 10, lng: 179 },
      { lat: 10, lng: -179 },
    ])
    expect(Math.abs(across.lng)).toBeCloseTo(180, 0)
  })

  it('computes a geometric median that resists an outlier', () => {
    const cluster = [
      { lat: 18.52, lng: 73.85 },
      { lat: 18.521, lng: 73.851 },
      { lat: 18.519, lng: 73.849 },
    ]
    const outlier = { lat: 18.9, lng: 74.3 }
    const points = [...cluster, outlier]
    const median = geometricMedian(points)
    const centroid = sphericalCentroid(points)
    expect(haversineMeters(median, cluster[0])).toBeLessThan(haversineMeters(centroid, cluster[0]))
  })

  it('stays put when the median coincides with an input point', () => {
    const points = [
      { lat: 18.5, lng: 73.8 },
      { lat: 18.5, lng: 73.8 },
      { lat: 18.5, lng: 73.8 },
      { lat: 18.6, lng: 73.9 },
    ]
    const m = geometricMedian(points)
    expect(Number.isFinite(m.lat) && Number.isFinite(m.lng)).toBe(true)
    expect(haversineMeters(m, points[0])).toBeLessThan(50)
  })

  it('projects a destination point at the right distance', () => {
    const p = destinationPoint(pune.kothrud, 90, 5000)
    expect(haversineMeters(pune.kothrud, p)).toBeCloseTo(5000, -1)
    expect(p.lng).toBeGreaterThan(pune.kothrud.lng)
  })

  it('reports the spread of a group', () => {
    const c = sphericalCentroid(Object.values(pune))
    const spread = maxDistanceFrom(c, Object.values(pune))
    expect(spread).toBeGreaterThan(5000)
    expect(spread).toBeLessThan(20000)
  })
})

describe('candidate areas', () => {
  it('starts with the centroid, adds the median and a ring', () => {
    const areas = buildCandidateAreas(Object.values(pune), { maxCandidates: 8 })
    expect(areas[0].kind).toBe('centroid')
    expect(areas.length).toBeGreaterThan(2)
    expect(areas.length).toBeLessThanOrEqual(8)
    expect(areas.filter((a) => a.kind === 'ring').length).toBeGreaterThan(0)
    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) expect(haversineMeters(areas[i], areas[j])).toBeGreaterThanOrEqual(300)
    }
  })

  it('respects maxCandidates and never returns zero', () => {
    expect(buildCandidateAreas(Object.values(pune), { maxCandidates: 3 })).toHaveLength(3)
    expect(buildCandidateAreas(Object.values(pune), { maxCandidates: 0 })).toHaveLength(1)
  })

  it('clamps the ring radius', () => {
    expect(ringRadiusFor(100)).toBe(800)
    expect(ringRadiusFor(10_000)).toBe(3000)
    expect(ringRadiusFor(1_000_000)).toBe(8000)
  })
})

describe('route matrix helpers', () => {
  it('parses protobuf durations', () => {
    expect(parseDurationSeconds('1234s')).toBe(1234)
    expect(parseDurationSeconds('12.6s')).toBe(13)
    expect(parseDurationSeconds('abc')).toBeNull()
    expect(parseDurationSeconds(undefined)).toBeNull()
  })

  it('knows the element limits and routing preferences', () => {
    expect(elementLimit('TRANSIT')).toBe(100)
    expect(elementLimit('DRIVE')).toBe(625)
    expect(routingPreferenceFor('DRIVE')).toBe('TRAFFIC_AWARE')
    expect(routingPreferenceFor('TWO_WHEELER')).toBe('TRAFFIC_AWARE')
    expect(routingPreferenceFor('WALK')).toBeUndefined()
    expect(routingPreferenceFor('TRANSIT')).toBeUndefined()
  })

  it('builds a table and never invents a missing element', () => {
    const table = buildTimeTable(
      [
        { originIndex: 0, destinationIndex: 0, duration: '600s', distanceMeters: 5000, condition: 'ROUTE_EXISTS' },
        // REST omits zero-valued indexes and fields.
        { destinationIndex: 1, duration: '0s', condition: 'ROUTE_EXISTS' },
        { originIndex: 1, destinationIndex: 0, condition: 'ROUTE_NOT_FOUND' },
        { originIndex: 1, destinationIndex: 1, status: { code: 5, message: 'x' } },
        { originIndex: 9, destinationIndex: 0, duration: '1s' },
      ],
      2,
      3,
    )
    expect(table[0][0]).toMatchObject({ ok: true, durationSeconds: 600, distanceMeters: 5000 })
    expect(table[0][1]).toMatchObject({ ok: true, durationSeconds: 0, distanceMeters: 0 })
    expect(table[1][0]).toMatchObject({ ok: false, durationSeconds: null, condition: 'ROUTE_NOT_FOUND' })
    expect(table[1][1]).toMatchObject({ ok: false, condition: 'ERROR_5' })
    expect(table[0][2]).toMatchObject({ ok: false, condition: 'MISSING' })
  })
})

describe('activity selection', () => {
  const shortlist = [
    { activityId: 'a', name: 'Cafe', placesQuery: 'cafe', votes: 2 },
    { activityId: 'b', name: 'Movies', placesQuery: 'movie theater', votes: 4 },
    { activityId: 'c', name: 'Bowling', placesQuery: 'bowling alley', votes: 4 },
    { activityId: 'd', name: 'Park', placesQuery: 'park', votes: 0 },
    { activityId: 'e', name: 'Arcade', placesQuery: 'arcade', votes: 1 },
    { activityId: 'f', name: 'Market', placesQuery: 'market', votes: 1 },
    { activityId: 'g', name: 'Broken', placesQuery: '', votes: 9 },
  ]

  it('uses every shortlisted activity, most voted first, capped at five', () => {
    const picked = pickActivities(shortlist, 'all_selected')
    expect(picked.map((a) => a.activityId)).toEqual(['b', 'c', 'a', 'e', 'f'])
  })

  it('keeps every activity tied for most votes', () => {
    expect(pickActivities(shortlist, 'most_popular').map((a) => a.activityId)).toEqual(['b', 'c'])
  })

  it('handles an empty shortlist', () => {
    expect(pickActivities([], 'most_popular')).toEqual([])
  })
})

describe('hashing', () => {
  it('is independent of key order', async () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}')
    const h1 = await sha256Hex(stableStringify({ x: 1, y: 2 }))
    const h2 = await sha256Hex(stableStringify({ y: 2, x: 1 }))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })
})
