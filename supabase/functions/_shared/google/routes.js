/**
 * Google Routes API (v2) REST client. Server-side only: it needs the
 * unrestricted-by-referrer server key, which must never reach the browser.
 */
import { googleFetch } from './errors.js'
import { parseDurationSeconds, routingPreferenceFor, supportsDepartureTime } from '../engine/matrix.js'

export const ROUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
export const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

const MATRIX_FIELDS = 'originIndex,destinationIndex,duration,distanceMeters,status,condition'
const ROUTE_FIELDS = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
const MAX_FUTURE_MS = 90 * 24 * 3600 * 1000

function latLng(p) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
}

/**
 * Departure time is sent only when it is meaningful: a future time (at least
 * a minute ahead, at most 90 days) for modes that use traffic or timetables.
 * Otherwise Google uses "now".
 */
export function departureTimeFor(travelMode, departureTime, now = Date.now()) {
  if (!departureTime || !supportsDepartureTime(travelMode)) return undefined
  const t = Date.parse(departureTime)
  if (!Number.isFinite(t) || t <= now + 60_000 || t > now + MAX_FUTURE_MS) return undefined
  return new Date(t).toISOString()
}

function baseBody(travelMode, departureTime, now) {
  const body = { travelMode }
  const preference = routingPreferenceFor(travelMode)
  if (preference) body.routingPreference = preference
  const departure = departureTimeFor(travelMode, departureTime, now)
  if (departure) body.departureTime = departure
  return body
}

/**
 * @returns {Promise<object[]>} raw matrix elements
 *   ({ originIndex, destinationIndex, duration, distanceMeters, status, condition })
 */
export async function computeRouteMatrix({ apiKey, fetch, origins, destinations, travelMode, departureTime, now }) {
  if (!origins?.length || !destinations?.length) return []
  const body = {
    origins: origins.map((p) => ({ waypoint: latLng(p) })),
    destinations: destinations.map((p) => ({ waypoint: latLng(p) })),
    ...baseBody(travelMode, departureTime, now),
  }
  const response = await googleFetch(fetch, 'Routes', ROUTE_MATRIX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': MATRIX_FIELDS,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

/**
 * One route with its overview polyline, for drawing on the map.
 * @returns {Promise<{durationSeconds:number|null, distanceMeters:number|null, polyline:string|null}|null>}
 *   null when Google returns no route.
 */
export async function computeRoute({ apiKey, fetch, origin, destination, travelMode, departureTime, now }) {
  const body = {
    origin: latLng(origin),
    destination: latLng(destination),
    polylineQuality: 'OVERVIEW',
    ...baseBody(travelMode, departureTime, now),
  }
  const response = await googleFetch(fetch, 'Routes', COMPUTE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': ROUTE_FIELDS,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  const route = data?.routes?.[0]
  if (!route) return null
  return {
    durationSeconds: parseDurationSeconds(route.duration),
    distanceMeters: Number.isFinite(route.distanceMeters) ? route.distanceMeters : 0,
    polyline: route.polyline?.encodedPolyline ?? null,
  }
}
