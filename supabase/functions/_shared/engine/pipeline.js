/**
 * The Meetzy midpoint engine.
 *
 *  1. Geographic centre (spherical centroid) and geometric median of the
 *     participants set the initial search area.
 *  2. Candidate areas around the centre are route-matrixed against every
 *     participant (real travel times), and the best area for the chosen
 *     strategy wins.
 *  3. Real venues for each selected activity are found around that area.
 *  4. Every participant is route-matrixed against every venue.
 *  5. Venues are ranked (balanced / fair / fastest) and explained.
 *
 * All I/O is injected (`io`), so this module runs unchanged in the Edge
 * Function (Deno), in Node tests and in the browser. Missing routes stay
 * missing; nothing is estimated or invented.
 */
import { buildCandidateAreas } from './candidates.js'
import { clamp, haversineMeters, maxDistanceFrom, sphericalCentroid } from './geo.js'
import { buildTimeTable, durationsTo, elementLimit } from './matrix.js'
import { rankVenues, summarizeTimes } from './ranking.js'
import { explainArea, explainVenue } from './explain.js'
import { EngineError } from './errors.js'

export const MAX_PARTICIPANTS = 25
export const MAX_VENUES = 25
export const MAX_CANDIDATE_AREAS = 8
export const PHOTO_COUNT = 8

export { EngineError }

export function searchRadiusFor(spreadMeters) {
  return Math.round(clamp(spreadMeters * 0.35, 1500, 6000))
}

function validParticipant(p) {
  return (
    p &&
    p.userId &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  )
}

function countFailures(table) {
  let failed = 0
  for (const row of table) for (const cell of row) if (!cell.ok) failed += 1
  return failed
}

async function searchAround(area, { activities, radiusMeters, io, warnings }) {
  const settled = await Promise.allSettled(
    activities.map((activity) =>
      io.searchPlaces({ textQuery: activity.placesQuery, center: { lat: area.lat, lng: area.lng }, radiusMeters }),
    ),
  )

  const failures = settled.filter((r) => r.status === 'rejected')
  if (failures.length === settled.length && failures.length) throw failures[0].reason

  const seen = new Set()
  const perActivity = activities.map((activity, i) => {
    const result = settled[i]
    if (result.status === 'rejected') {
      warnings.push(`Venue search for "${activity.name}" failed, so it was skipped.`)
      return []
    }
    const list = []
    for (const place of result.value ?? []) {
      if (!place?.placeId || seen.has(place.placeId)) continue
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue
      if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') continue
      const distance = haversineMeters(area, { lat: place.lat, lng: place.lng })
      if (distance > radiusMeters * 3) continue
      seen.add(place.placeId)
      list.push({ ...place, activityId: activity.activityId, distanceFromAreaMeters: Math.round(distance) })
    }
    return list
  })
  return { perActivity, total: seen.size }
}

/** Take venues round-robin across activities, keeping Google's order inside each. */
export function roundRobin(lists, limit) {
  const out = []
  const cursors = lists.map(() => 0)
  let progressed = true
  while (out.length < limit && progressed) {
    progressed = false
    for (let i = 0; i < lists.length && out.length < limit; i++) {
      if (cursors[i] < lists[i].length) {
        out.push(lists[i][cursors[i]])
        cursors[i] += 1
        progressed = true
      }
    }
  }
  return out
}

/**
 * @param {object} input
 * @param {{userId:string,name?:string,lat:number,lng:number}[]} input.participants
 * @param {{activityId:string,name:string,placesQuery:string}[]} input.activities
 * @param {'DRIVE'|'TWO_WHEELER'|'WALK'|'BICYCLE'|'TRANSIT'} input.travelMode
 * @param {'balanced'|'fair'|'fastest'} input.strategy
 * @param {string|null} [input.departureTime] ISO timestamp
 * @param {number|null} [input.maxTravelSeconds]
 * @param {object} io { routeMatrix, searchPlaces, getPhotoUri? }
 */
export async function runMeetupEngine(input, io) {
  const travelMode = input?.travelMode ?? 'DRIVE'
  const strategy = input?.strategy ?? 'fair'
  const departureTime = input?.departureTime ?? null
  const maxTravelSeconds = input?.maxTravelSeconds ?? null
  const participants = (input?.participants ?? []).filter(validParticipant)
  const activities = (input?.activities ?? []).filter((a) => a?.activityId && a?.placesQuery)

  if (participants.length < 2) {
    throw new EngineError('not_enough_locations', 'At least two friends need to share a location first.')
  }
  if (participants.length > MAX_PARTICIPANTS) {
    throw new EngineError(
      'too_many_participants',
      `Meetzy can compare routes for up to ${MAX_PARTICIPANTS} people at once.`,
    )
  }
  if (!activities.length) {
    throw new EngineError('no_activities', 'Pick at least one activity first.')
  }

  const n = participants.length
  const limit = elementLimit(travelMode)
  const warnings = []
  let routesRequested = 0
  let routesFailed = 0

  // 1. Initial search area.
  const points = participants.map((p) => ({ lat: p.lat, lng: p.lng }))
  const center = sphericalCentroid(points)
  const spread = maxDistanceFrom(center, points)

  // 2. Candidate areas, sized to the element budget, scored by real travel time.
  const maxCandidates = Math.max(1, Math.min(MAX_CANDIDATE_AREAS, Math.floor(limit / n)))
  const candidates = buildCandidateAreas(points, { maxCandidates })
  const elements1 = await io.routeMatrix({ origins: points, destinations: candidates, travelMode, departureTime })
  const table1 = buildTimeTable(elements1, n, candidates.length)
  routesRequested += n * candidates.length
  routesFailed += countFailures(table1)

  const areas = candidates.map((c, d) => ({
    ...c,
    summary: summarizeTimes(durationsTo(table1, d), n, maxTravelSeconds),
  }))
  const rankedAreas = rankVenues(areas, strategy, { maxTravelSeconds }).filter((a) => a.summary.reachable > 0)
  if (!rankedAreas.length) {
    throw new EngineError(
      'no_routes',
      'Google could not find routes between your locations for this travel mode. Try another mode.',
    )
  }

  // 3. Real venues around the best area (one retry around the runner-up).
  const radiusMeters = searchRadiusFor(spread)
  let area = rankedAreas[0]
  let search = await searchAround(area, { activities, radiusMeters, io, warnings })
  if (!search.total && rankedAreas[1]) {
    area = rankedAreas[1]
    warnings.push('Nothing matched around the best area, so Meetzy searched the next-best area.')
    search = await searchAround(area, { activities, radiusMeters, io, warnings })
  }
  if (!search.total) {
    throw new EngineError('no_venues', 'No matching venues were found near the meeting area. Try other activities.')
  }
  if (!area.summary.complete) {
    warnings.push(
      `Routes to the meeting area were found for ${area.summary.reachable} of ${n} friends only.`,
    )
  }

  // 4. Everyone against every chosen venue.
  const venueBudget = Math.max(1, Math.min(MAX_VENUES, Math.floor(limit / n)))
  const chosen = roundRobin(search.perActivity, venueBudget)
  const elements2 = await io.routeMatrix({
    origins: points,
    destinations: chosen.map((v) => ({ lat: v.lat, lng: v.lng })),
    travelMode,
    departureTime,
  })
  const table2 = buildTimeTable(elements2, n, chosen.length)
  routesRequested += n * chosen.length
  routesFailed += countFailures(table2)

  let venues = chosen.map((place, d) => ({
    place,
    routes: participants.map((p, o) => ({
      userId: p.userId,
      durationSeconds: table2[o][d].durationSeconds,
      distanceMeters: table2[o][d].distanceMeters,
      condition: table2[o][d].condition,
    })),
    summary: summarizeTimes(durationsTo(table2, d), n, maxTravelSeconds),
  }))

  const unreachable = venues.filter((v) => v.summary.reachable === 0).length
  venues = venues.filter((v) => v.summary.reachable > 0)
  if (unreachable) warnings.push(`${unreachable} venue(s) were dropped because nobody had a route there.`)
  if (!venues.length) {
    throw new EngineError('no_routes', 'Google could not find routes to any venue near the meeting area.')
  }

  // 5. Rank and explain.
  const ranked = rankVenues(venues, strategy, { maxTravelSeconds })
  const people = participants.map((p) => ({ userId: p.userId, name: p.name }))

  // Photo URIs for the top venues; a failed lookup just means no photo.
  const photoUris = new Map()
  if (typeof io.getPhotoUri === 'function') {
    const top = ranked.slice(0, PHOTO_COUNT).filter((v) => v.place.photoName)
    const settled = await Promise.allSettled(top.map((v) => io.getPhotoUri(v.place.photoName)))
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' && typeof r.value === 'string' && r.value) photoUris.set(top[i].place.placeId, r.value)
    })
  }

  const outVenues = ranked.map((v) => {
    const p = v.place
    const hasPhoto = photoUris.has(p.placeId)
    return {
      placeId: p.placeId,
      name: p.name ?? null,
      address: p.address ?? null,
      lat: p.lat,
      lng: p.lng,
      rating: p.rating ?? null,
      ratingCount: p.ratingCount ?? null,
      priceLevel: p.priceLevel ?? null,
      primaryType: p.primaryType ?? null,
      primaryTypeLabel: p.primaryTypeLabel ?? null,
      activityId: p.activityId,
      googleMapsUri: p.googleMapsUri ?? null,
      photoUri: hasPhoto ? photoUris.get(p.placeId) : null,
      photoAttributions: hasPhoto ? (p.photoAttributions ?? []) : [],
      openingHours: p.openingHours ?? null,
      openNow: p.openNow ?? null,
      businessStatus: p.businessStatus ?? null,
      distanceFromAreaMeters: p.distanceFromAreaMeters,
      rank: v.rank,
      summary: v.summary,
      explanation: explainVenue(
        { summary: v.summary, rank: v.rank },
        { strategy, venuesConsidered: ranked.length, participants: people, routes: v.routes, maxTravelSeconds },
      ),
      routes: v.routes,
    }
  })

  return {
    center: { lat: center.lat, lng: center.lng },
    area: { lat: area.lat, lng: area.lng, kind: area.kind },
    areaExplanation: explainArea(area, {
      strategy,
      candidatesConsidered: candidates.length,
      travelMode,
    }),
    areas: candidates.map((c, d) => {
      const s = areas[d].summary
      return {
        lat: c.lat,
        lng: c.lng,
        kind: c.kind,
        avg: s.avg,
        max: s.max,
        total: s.total,
        complete: s.complete,
        chosen: c.id === area.id,
      }
    }),
    activitiesUsed: activities.map((a) => ({ activityId: a.activityId, name: a.name })),
    placesFound: search.total,
    venuesConsidered: ranked.length,
    routesRequested,
    routesFailed,
    warnings,
    venues: outVenues,
  }
}
