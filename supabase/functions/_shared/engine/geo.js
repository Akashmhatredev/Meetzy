/**
 * Spherical geometry helpers. Points are { lat, lng } in degrees.
 * Pure functions, shared by the Edge Functions, the browser and the tests.
 */

export const EARTH_RADIUS_M = 6371008.8

export function toRadians(deg) {
  return (deg * Math.PI) / 180
}

export function toDegrees(rad) {
  return (rad * 180) / Math.PI
}

/** Great-circle distance in metres. */
export function haversineMeters(a, b) {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function toVector({ lat, lng }) {
  const phi = toRadians(lat)
  const lambda = toRadians(lng)
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)]
}

function fromVector([x, y, z]) {
  const hyp = Math.sqrt(x * x + y * y)
  return { lat: toDegrees(Math.atan2(z, hyp)), lng: toDegrees(Math.atan2(y, x)) }
}

/**
 * Centre of mass on the sphere: average the unit vectors and project back.
 * Unlike averaging latitude/longitude it behaves across the antimeridian.
 */
export function sphericalCentroid(points) {
  if (!points?.length) throw new Error('sphericalCentroid needs at least one point')
  let x = 0
  let y = 0
  let z = 0
  for (const p of points) {
    const [px, py, pz] = toVector(p)
    x += px
    y += py
    z += pz
  }
  const n = points.length
  const len = Math.sqrt(x * x + y * y + z * z)
  // Antipodal inputs cancel out; fall back to the first point.
  if (len / n < 1e-9) return { lat: points[0].lat, lng: points[0].lng }
  return fromVector([x / n, y / n, z / n])
}

/**
 * Geometric median (the point minimising the sum of distances), via
 * Weiszfeld's algorithm on a local equirectangular projection. It is less
 * pulled by one far-away friend than the centroid. Robust when the estimate
 * lands exactly on an input point.
 */
export function geometricMedian(points, { iterations = 100, toleranceMeters = 1 } = {}) {
  if (!points?.length) throw new Error('geometricMedian needs at least one point')
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng }

  const origin = sphericalCentroid(points)
  const cosLat = Math.cos(toRadians(origin.lat)) || 1e-9
  const project = (p) => {
    let dLng = p.lng - origin.lng
    if (dLng > 180) dLng -= 360
    if (dLng < -180) dLng += 360
    return [toRadians(dLng) * cosLat * EARTH_RADIUS_M, toRadians(p.lat - origin.lat) * EARTH_RADIUS_M]
  }
  const unproject = ([x, y]) => {
    let lng = origin.lng + toDegrees(x / (cosLat * EARTH_RADIUS_M))
    if (lng > 180) lng -= 360
    if (lng < -180) lng += 360
    return { lat: origin.lat + toDegrees(y / EARTH_RADIUS_M), lng }
  }

  const xy = points.map(project)
  let est = [0, 0]
  for (const [px, py] of xy) {
    est[0] += px / xy.length
    est[1] += py / xy.length
  }

  for (let i = 0; i < iterations; i++) {
    let numX = 0
    let numY = 0
    let denom = 0
    let coincident = 0
    for (const [px, py] of xy) {
      const d = Math.hypot(px - est[0], py - est[1])
      if (d < 1e-6) {
        coincident += 1
        continue
      }
      numX += px / d
      numY += py / d
      denom += 1 / d
    }
    if (denom === 0) break
    let next = [numX / denom, numY / denom]
    if (coincident > 0) {
      // Vardi–Zhang correction: stay on the coincident point when it is optimal.
      const r = Math.hypot(numX - est[0] * denom, numY - est[1] * denom)
      const gamma = r === 0 ? 0 : Math.min(1, coincident / r)
      next = [(1 - gamma) * next[0] + gamma * est[0], (1 - gamma) * next[1] + gamma * est[1]]
    }
    const moved = Math.hypot(next[0] - est[0], next[1] - est[1])
    est = next
    if (moved < toleranceMeters) break
  }
  return unproject(est)
}

/** Point reached travelling `meters` from origin on an initial bearing (degrees from north). */
export function destinationPoint(origin, bearingDeg, meters) {
  const delta = meters / EARTH_RADIUS_M
  const theta = toRadians(bearingDeg)
  const phi1 = toRadians(origin.lat)
  const lambda1 = toRadians(origin.lng)
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    )
  let lng = toDegrees(lambda2)
  lng = ((lng + 540) % 360) - 180
  return { lat: toDegrees(phi2), lng }
}

/** Largest distance (metres) from center to any of the points. */
export function maxDistanceFrom(center, points) {
  let max = 0
  for (const p of points) max = Math.max(max, haversineMeters(center, p))
  return max
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
