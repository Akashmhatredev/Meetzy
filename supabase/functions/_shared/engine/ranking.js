/**
 * Travel-time ranking. Shared verbatim by the compute-meetup Edge Function
 * and the browser (imported as `@engine/ranking.js`), so the app can
 * re-rank stored results for a different strategy without calling Google
 * again. Dependency-free on purpose.
 *
 * All times are integer seconds. A null time means Google found no route;
 * it is never replaced by an estimate.
 */

export const STRATEGIES = {
  balanced: {
    label: 'Balanced',
    short: 'Lowest average trip',
    description: 'Minimises the average travel time across the group.',
  },
  fair: {
    label: 'Fair',
    short: 'Nobody travels too long',
    description: 'Minimises the longest individual trip so nobody gets a disproportionately long journey.',
  },
  fastest: {
    label: 'Fastest',
    short: 'Least total travel',
    description: 'Minimises the total time the whole group spends travelling.',
  },
}

export const DEFAULT_STRATEGY = 'fair'

function isTime(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * @param {(number|null|undefined)[]} secondsArray one entry per participant
 * @param {number} [participantCount] defaults to secondsArray.length
 * @param {number|null} [maxTravelSeconds] optional per-person limit
 */
export function summarizeTimes(secondsArray, participantCount, maxTravelSeconds = null) {
  const list = Array.isArray(secondsArray) ? secondsArray : []
  const participants = Number.isInteger(participantCount) ? participantCount : list.length
  const times = list.filter(isTime).map((t) => Math.round(t))
  const reachable = times.length

  if (reachable === 0) {
    return {
      avg: null,
      max: null,
      min: null,
      total: null,
      spread: null,
      reachable: 0,
      participants,
      complete: false,
      withinLimit: maxTravelSeconds ? false : true,
    }
  }

  const total = times.reduce((sum, t) => sum + t, 0)
  const max = Math.max(...times)
  const min = Math.min(...times)
  return {
    avg: Math.round(total / reachable),
    max,
    min,
    total,
    spread: max - min,
    reachable,
    participants,
    complete: participants > 0 && reachable === participants,
    withinLimit: maxTravelSeconds ? max <= maxTravelSeconds : true,
  }
}

/**
 * Normalises a venue (or candidate area) to a summary. Accepts both the
 * engine shape ({ summary }) and the database row shape (snake_case).
 */
export function summaryOf(venue) {
  if (!venue) return summarizeTimes([], 0)
  if (venue.summary) return venue.summary
  return {
    avg: venue.avg_travel_seconds ?? null,
    max: venue.max_travel_seconds ?? null,
    min: venue.min_travel_seconds ?? null,
    total: venue.total_travel_seconds ?? null,
    spread: venue.spread_seconds ?? null,
    reachable: venue.reachable_count ?? 0,
    participants: venue.participant_count ?? 0,
    complete: Boolean(venue.routes_complete),
    withinLimit: venue.within_limit ?? true,
  }
}

const PRIMARY = { balanced: 'avg', fair: 'max', fastest: 'total' }
const SECONDARY = { balanced: 'max', fair: 'avg', fastest: 'max' }

function metric(summary, key) {
  const value = summary?.[key]
  return isTime(value) ? value : Infinity
}

/** The number a strategy minimises (Infinity when unknown). */
export function strategyScore(summary, strategy = DEFAULT_STRATEGY) {
  return metric(summary, PRIMARY[strategy] ?? PRIMARY[DEFAULT_STRATEGY])
}

/** Comparator for two summaries under a strategy, including its tie-breakers. */
export function compareSummaries(a, b, strategy = DEFAULT_STRATEGY) {
  const key = PRIMARY[strategy] ?? PRIMARY[DEFAULT_STRATEGY]
  const tie = SECONDARY[strategy] ?? SECONDARY[DEFAULT_STRATEGY]
  return metric(a, key) - metric(b, key) || metric(a, tie) - metric(b, tie) || metric(a, 'spread') - metric(b, 'spread')
}

function withLimit(summary, maxTravelSeconds) {
  if (!maxTravelSeconds) return summary
  return { ...summary, withinLimit: summary.reachable > 0 && isTime(summary.max) && summary.max <= maxTravelSeconds }
}

/** 0: everyone can get there within the limit, 1: everyone but over the limit, 2: someone has no route. */
function tierOf(summary) {
  if (!summary.complete) return 2
  return summary.withinLimit === false ? 1 : 0
}

/**
 * Ranks venues for a strategy. Complete routes within the limit come
 * first, then complete routes over the limit, then venues where someone
 * has no route (more reachable people first). Returns new objects with
 * `rank` (1-based); input order breaks remaining ties.
 */
export function rankVenues(venues, strategy = DEFAULT_STRATEGY, { maxTravelSeconds = null } = {}) {
  const decorated = (venues ?? []).map((venue, index) => ({
    venue,
    index,
    summary: withLimit(summaryOf(venue), maxTravelSeconds),
  }))
  decorated.sort((a, b) => {
    const tier = tierOf(a.summary) - tierOf(b.summary)
    if (tier) return tier
    if (tierOf(a.summary) === 2) {
      const reach = b.summary.reachable - a.summary.reachable
      if (reach) return reach
    }
    return compareSummaries(a.summary, b.summary, strategy) || a.index - b.index
  })
  return decorated.map(({ venue, summary }, i) => {
    const out = { ...venue, rank: i + 1 }
    if (venue.summary) out.summary = summary
    else if (maxTravelSeconds) out.within_limit = summary.withinLimit
    return out
  })
}

function ratingOf(venue) {
  return typeof venue?.rating === 'number' ? venue.rating : typeof venue?.rating === 'string' ? Number(venue.rating) : null
}

function ratingCountOf(venue) {
  return venue?.ratingCount ?? venue?.rating_count ?? 0
}

function distanceOf(venue) {
  const d = venue?.distanceFromAreaMeters ?? venue?.distance_from_area_m
  return isTime(d) ? d : Infinity
}

function byMetric(key) {
  return (a, b) => {
    const sa = summaryOf(a)
    const sb = summaryOf(b)
    const ta = sa.complete ? 0 : 1
    const tb = sb.complete ? 0 : 1
    return ta - tb || metric(sa, key) - metric(sb, key)
  }
}

export const SORT_KEYS = {
  recommended: 'Recommended',
  rating: 'Highest rated',
  avg: 'Lowest average time',
  max: 'Lowest maximum time',
  distance: 'Closest to meeting area',
}

/**
 * Sorting for the venue filters. Returns a new array; only 'recommended'
 * changes `rank`.
 */
export function sortVenues(venues, key = 'recommended', strategy = DEFAULT_STRATEGY, options = {}) {
  const list = [...(venues ?? [])]
  switch (key) {
    case 'rating':
      return list.sort((a, b) => {
        const ra = ratingOf(a)
        const rb = ratingOf(b)
        if (ra === null && rb === null) return 0
        if (ra === null) return 1
        if (rb === null) return -1
        return rb - ra || ratingCountOf(b) - ratingCountOf(a)
      })
    case 'avg':
      return list.sort(byMetric('avg'))
    case 'max':
      return list.sort(byMetric('max'))
    case 'distance':
      return list.sort((a, b) => distanceOf(a) - distanceOf(b))
    case 'recommended':
    default:
      return rankVenues(list, strategy, options)
  }
}

function idOf(venue) {
  return venue?.id ?? venue?.placeId ?? venue?.google_place_id ?? null
}

/**
 * The "most balanced" pick for the comparison screen: among venues every
 * participant can reach, the one whose trips differ the least (then the
 * lowest average).
 */
export function bestBalancedId(venues) {
  let best = null
  for (const venue of venues ?? []) {
    const s = summaryOf(venue)
    if (!s.complete || !isTime(s.spread)) continue
    if (!best) {
      best = { venue, s }
      continue
    }
    if (s.spread < best.s.spread || (s.spread === best.s.spread && metric(s, 'avg') < metric(best.s, 'avg'))) {
      best = { venue, s }
    }
  }
  return best ? idOf(best.venue) : null
}
