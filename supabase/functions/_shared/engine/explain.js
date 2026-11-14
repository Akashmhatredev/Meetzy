/**
 * Human explanations for recommendations. Every sentence is derived from
 * the computed numbers only; nothing here guesses.
 */
import { summaryOf } from './ranking.js'

/** 1500 -> "25 min", 3900 -> "1 h 5 min", 20 -> "under 1 min". */
export function formatMinutes(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 30) return 'under 1 min'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function listNames(names) {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function friends(n) {
  return n === 1 ? '1 friend' : `${n} friends`
}

/**
 * @param {object} venue engine venue ({ summary, rank }) or database row
 * @param {object} context
 * @param {'balanced'|'fair'|'fastest'} context.strategy
 * @param {number} [context.venuesConsidered] how many venues were compared
 * @param {{userId:string,name:string}[]} [context.participants]
 * @param {{userId:string,durationSeconds:number|null}[]} [context.routes] this venue's routes
 * @param {number|null} [context.maxTravelSeconds]
 * @returns {string}
 */
export function explainVenue(venue, { strategy = 'fair', venuesConsidered = 0, participants = [], routes = [], maxTravelSeconds = null } = {}) {
  const s = summaryOf(venue)
  if (!s.reachable) {
    return 'Google could not find a route here for anyone in the group.'
  }

  const isTop = venue?.rank === 1 && venuesConsidered > 1
  const of = `of the ${venuesConsidered} venues Meetzy compared`
  const sentences = []

  if (s.complete) {
    if (strategy === 'balanced') {
      sentences.push(
        isTop
          ? `The average trip here is about ${formatMinutes(s.avg)}, the lowest ${of}.`
          : `The average trip here is about ${formatMinutes(s.avg)}.`,
      )
      sentences.push(`The longest trip is ${formatMinutes(s.max)}.`)
    } else if (strategy === 'fastest') {
      sentences.push(
        isTop
          ? `The group spends about ${formatMinutes(s.total)} travelling in total, the least ${of}.`
          : `The group spends about ${formatMinutes(s.total)} travelling in total.`,
      )
    } else {
      sentences.push(
        isTop
          ? `Everyone can get here within about ${formatMinutes(s.max)}, the shortest longest-trip ${of}.`
          : `Everyone can get here within about ${formatMinutes(s.max)}.`,
      )
    }

    if (s.participants > 1 && typeof s.spread === 'number') {
      if (s.spread < 60) sentences.push('Everyone’s trip is within a minute of each other.')
      else if (s.spread <= 10 * 60) sentences.push(`Trips differ by only ${formatMinutes(s.spread)}.`)
    }
  } else {
    sentences.push(`Reachable for ${s.reachable} of ${s.participants} ${s.participants === 1 ? 'friend' : 'friends'}, with the longest trip about ${formatMinutes(s.max)}.`)
  }

  if (maxTravelSeconds && s.withinLimit === false) {
    sentences.push(`At least one trip is longer than your ${formatMinutes(maxTravelSeconds)} limit.`)
  }

  if (!s.complete) {
    const reachableIds = new Set(
      (routes ?? []).filter((r) => typeof r.durationSeconds === 'number').map((r) => r.userId),
    )
    const missing = (participants ?? []).filter((p) => !reachableIds.has(p.userId)).map((p) => p.name || 'a friend')
    if (missing.length) {
      sentences.push(
        `No route was found for ${listNames(missing)}, so this is based on ${s.reachable} of ${friends(s.participants)}.`,
      )
    }
  }

  return sentences.join(' ')
}

const KIND_PHRASE = {
  centroid: 'the geographic middle of the group',
  median: 'the point closest to everyone overall',
  ring: 'an area just off the geographic middle',
}

const MODE_WORD = {
  DRIVE: 'driving',
  TWO_WHEELER: 'two-wheeler',
  WALK: 'walking',
  BICYCLE: 'cycling',
  TRANSIT: 'public transport',
}

/**
 * Why the engine searched around this area.
 * @param {{kind:string, summary?:object}} area
 * @param {{strategy?:string, candidatesConsidered?:number, travelMode?:string}} context
 */
export function explainArea(area, { strategy = 'fair', candidatesConsidered = 1, travelMode = 'DRIVE' } = {}) {
  const s = summaryOf(area)
  const where = KIND_PHRASE[area?.kind] ?? 'this area'
  const mode = MODE_WORD[travelMode] ?? 'travel'
  const compared =
    candidatesConsidered > 1
      ? `Meetzy compared ${candidatesConsidered} possible meeting areas using real ${mode} times and chose ${where}`
      : `Meetzy checked ${where} using real ${mode} times`

  if (!s.reachable) return `${compared}.`
  let reason
  if (strategy === 'balanced') reason = `the average trip there is about ${formatMinutes(s.avg)}`
  else if (strategy === 'fastest') reason = `the group's total travel there is about ${formatMinutes(s.total)}`
  else reason = `everyone can reach it within about ${formatMinutes(s.max)}`
  if (!s.complete) reason = `${reason} for ${s.reachable} of ${s.participants} friends`
  return `${compared}, where ${reason}.`
}
