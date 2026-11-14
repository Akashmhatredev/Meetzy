/**
 * Candidate meeting areas around the group. The engine route-matrixes every
 * member against each area and keeps the one that is best for the chosen
 * strategy, so the search for venues starts where travel is actually fair,
 * not just where the geometric middle happens to be.
 */
import { clamp, destinationPoint, geometricMedian, haversineMeters, maxDistanceFrom, sphericalCentroid } from './geo.js'

const RING_BEARINGS = [0, 60, 120, 180, 240, 300]
const MIN_SEPARATION_M = 300
const MEDIAN_MIN_OFFSET_M = 150

export function ringRadiusFor(spreadMeters) {
  return clamp(spreadMeters * 0.3, 800, 8000)
}

/**
 * @param {{lat:number,lng:number}[]} points participant locations
 * @param {{maxCandidates?: number}} [options]
 * @returns {{id:string,lat:number,lng:number,kind:'centroid'|'median'|'ring'}[]}
 */
export function buildCandidateAreas(points, { maxCandidates = 8 } = {}) {
  if (!points?.length) return []
  const limit = Math.max(1, Math.floor(maxCandidates))
  const centroid = sphericalCentroid(points)
  const median = geometricMedian(points)
  const spread = maxDistanceFrom(centroid, points)

  const out = []
  const push = (point, kind) => {
    if (out.length >= limit) return
    if (out.some((c) => haversineMeters(c, point) < MIN_SEPARATION_M)) return
    out.push({ id: `${kind}-${out.length}`, lat: point.lat, lng: point.lng, kind })
  }

  push(centroid, 'centroid')
  if (haversineMeters(centroid, median) > MEDIAN_MIN_OFFSET_M) push(median, 'median')

  const radius = ringRadiusFor(spread)
  for (const bearing of RING_BEARINGS) push(destinationPoint(centroid, bearing, radius), 'ring')

  return out
}
