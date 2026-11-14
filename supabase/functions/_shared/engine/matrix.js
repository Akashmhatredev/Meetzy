/**
 * Helpers around the Routes API Compute Route Matrix response.
 * Failed or missing elements stay failed: no travel time is ever invented.
 */

export const TRAVEL_MODES = ['DRIVE', 'TWO_WHEELER', 'WALK', 'BICYCLE', 'TRANSIT']

/** "1234s" (google.protobuf.Duration JSON) -> 1234. Returns null when unparseable. */
export function parseDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return null
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim())
  return match ? Math.round(Number(match[1])) : null
}

/**
 * Maximum origins x destinations per request. Google allows 625 elements,
 * or 100 for TRANSIT (and for TRAFFIC_AWARE_OPTIMAL, which we never use).
 */
export function elementLimit(travelMode) {
  return travelMode === 'TRANSIT' ? 100 : 625
}

/** Traffic-aware routing is only valid for road vehicles. */
export function routingPreferenceFor(travelMode) {
  return travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER' ? 'TRAFFIC_AWARE' : undefined
}

/** Departure time is only meaningful (and accepted) for these modes. */
export function supportsDepartureTime(travelMode) {
  return travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER' || travelMode === 'TRANSIT'
}

/** True when the element describes a usable route. */
export function isElementOk(element) {
  if (!element) return false
  if (element.status && element.status.code) return false
  if (element.condition && element.condition !== 'ROUTE_EXISTS') return false
  return parseDurationSeconds(element.duration) !== null
}

/**
 * @returns {{durationSeconds:number|null, distanceMeters:number|null, condition:string, ok:boolean}[][]}
 *   table[originIndex][destinationIndex]
 */
export function buildTimeTable(elements, nOrigins, nDestinations) {
  const table = Array.from({ length: nOrigins }, () =>
    Array.from({ length: nDestinations }, () => ({
      durationSeconds: null,
      distanceMeters: null,
      condition: 'MISSING',
      ok: false,
    })),
  )
  for (const element of elements ?? []) {
    const o = element?.originIndex ?? 0
    const d = element?.destinationIndex ?? 0
    // The REST API omits zero-valued indexes; guard against out-of-range data.
    if (!Number.isInteger(o) || !Number.isInteger(d) || o < 0 || d < 0 || o >= nOrigins || d >= nDestinations) {
      continue
    }
    const ok = isElementOk(element)
    table[o][d] = {
      durationSeconds: ok ? parseDurationSeconds(element.duration) : null,
      distanceMeters: ok && Number.isFinite(element.distanceMeters) ? element.distanceMeters : ok ? 0 : null,
      condition: ok
        ? 'ROUTE_EXISTS'
        : element.status?.code
          ? `ERROR_${element.status.code}`
          : element.condition || 'ROUTE_NOT_FOUND',
      ok,
    }
  }
  return table
}

/** Column d of the table: every origin's duration to destination d (null when failed). */
export function durationsTo(table, d) {
  return table.map((row) => (row[d]?.ok ? row[d].durationSeconds : null))
}
