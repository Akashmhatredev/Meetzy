import { describe, expect, it } from 'vitest'
import {
  bestBalancedId,
  rankVenues,
  sortVenues,
  STRATEGIES,
  strategyScore,
  summarizeTimes,
  summaryOf,
} from '../../supabase/functions/_shared/engine/ranking.js'
import { explainArea, explainVenue, formatMinutes } from '../../supabase/functions/_shared/engine/explain.js'

const min = (m) => m * 60

// The example from the product spec.
function specVenues(limit = null) {
  return [
    { id: 'A', summary: summarizeTimes([18, 22, 25, 20].map(min), 4, limit) },
    { id: 'B', summary: summarizeTimes([28, 15, 19, 32].map(min), 4, limit) },
    { id: 'C', summary: summarizeTimes([21, 24, 20, 23].map(min), 4, limit) },
  ]
}

const ids = (list) => list.map((v) => v.id)

describe('summarizeTimes', () => {
  it('computes avg, max, min, total and spread in seconds', () => {
    const s = summarizeTimes([18, 22, 25, 20].map(min), 4)
    expect(s).toEqual({
      avg: Math.round(min(85) / 4),
      max: min(25),
      min: min(18),
      total: min(85),
      spread: min(7),
      reachable: 4,
      participants: 4,
      complete: true,
      withinLimit: true,
    })
  })

  it('ignores missing routes instead of inventing them', () => {
    const s = summarizeTimes([min(10), null, undefined, min(20)], 4)
    expect(s.reachable).toBe(2)
    expect(s.complete).toBe(false)
    expect(s.avg).toBe(min(15))
  })

  it('handles nobody reachable', () => {
    const s = summarizeTimes([null, null], 2, min(30))
    expect(s).toMatchObject({ avg: null, max: null, reachable: 0, complete: false, withinLimit: false })
  })

  it('flags trips over the limit', () => {
    expect(summarizeTimes([min(10), min(31)], 2, min(30)).withinLimit).toBe(false)
    expect(summarizeTimes([min(10), min(30)], 2, min(30)).withinLimit).toBe(true)
  })
})

describe('strategies on the spec example', () => {
  it('exposes the three strategies', () => {
    expect(Object.keys(STRATEGIES)).toEqual(['balanced', 'fair', 'fastest'])
  })

  it('fair minimises the longest trip', () => {
    expect(ids(rankVenues(specVenues(), 'fair'))).toEqual(['C', 'A', 'B'])
  })

  it('balanced minimises the average trip', () => {
    expect(ids(rankVenues(specVenues(), 'balanced'))).toEqual(['A', 'C', 'B'])
  })

  it('fastest minimises total group travel', () => {
    expect(ids(rankVenues(specVenues(), 'fastest'))).toEqual(['A', 'C', 'B'])
  })

  it('sets 1-based ranks without mutating the input', () => {
    const input = specVenues()
    const ranked = rankVenues(input, 'fair')
    expect(ranked.map((v) => v.rank)).toEqual([1, 2, 3])
    expect(input[0].rank).toBeUndefined()
  })

  it('scores by the strategy metric', () => {
    const s = summarizeTimes([18, 22, 25, 20].map(min), 4)
    expect(strategyScore(s, 'fair')).toBe(min(25))
    expect(strategyScore(s, 'fastest')).toBe(min(85))
    expect(strategyScore(s, 'balanced')).toBe(Math.round(min(85) / 4))
    expect(strategyScore(summarizeTimes([], 2), 'fair')).toBe(Infinity)
  })

  it('ranks a venue with a missing route last even when its times are short', () => {
    const venues = [...specVenues(), { id: 'D', summary: summarizeTimes([min(5), min(5), null, min(5)], 4) }]
    for (const strategy of Object.keys(STRATEGIES)) {
      expect(ids(rankVenues(venues, strategy)).at(-1)).toBe('D')
    }
  })

  it('orders incomplete venues by how many people can reach them', () => {
    const venues = [
      { id: 'one', summary: summarizeTimes([null, null, min(1)], 3) },
      { id: 'twoSlow', summary: summarizeTimes([min(50), min(50), null], 3) },
      { id: 'two', summary: summarizeTimes([min(5), min(6), null], 3) },
    ]
    expect(ids(rankVenues(venues, 'fair'))).toEqual(['two', 'twoSlow', 'one'])
  })

  it('puts venues within the max travel time first', () => {
    const ranked = rankVenues(specVenues(), 'balanced', { maxTravelSeconds: min(24) })
    expect(ids(ranked)).toEqual(['C', 'A', 'B'])
    expect(ranked[0].summary.withinLimit).toBe(true)
    expect(ranked[1].summary.withinLimit).toBe(false)
  })

  it('picks the most balanced venue by smallest spread', () => {
    expect(bestBalancedId(specVenues())).toBe('C')
    expect(bestBalancedId([])).toBeNull()
  })
})

describe('database row shape', () => {
  const rows = [
    {
      id: 'A',
      avg_travel_seconds: 1275,
      max_travel_seconds: 1500,
      min_travel_seconds: 1080,
      total_travel_seconds: 5100,
      spread_seconds: 420,
      reachable_count: 4,
      participant_count: 4,
      routes_complete: true,
      within_limit: true,
      rating: 4.1,
      rating_count: 20,
      distance_from_area_m: 900,
    },
    {
      id: 'C',
      avg_travel_seconds: 1320,
      max_travel_seconds: 1440,
      min_travel_seconds: 1200,
      total_travel_seconds: 5280,
      spread_seconds: 240,
      reachable_count: 4,
      participant_count: 4,
      routes_complete: true,
      within_limit: true,
      rating: '4.6',
      rating_count: 300,
      distance_from_area_m: 400,
    },
    {
      id: 'X',
      avg_travel_seconds: 600,
      max_travel_seconds: 600,
      min_travel_seconds: 600,
      total_travel_seconds: 1800,
      spread_seconds: 0,
      reachable_count: 3,
      participant_count: 4,
      routes_complete: false,
      within_limit: true,
      rating: null,
      rating_count: null,
      distance_from_area_m: null,
    },
  ]

  it('reads snake_case rows', () => {
    expect(summaryOf(rows[0])).toMatchObject({ avg: 1275, max: 1500, complete: true, reachable: 4 })
  })

  it('re-ranks stored rows for any strategy', () => {
    expect(ids(rankVenues(rows, 'fair'))).toEqual(['C', 'A', 'X'])
    expect(ids(rankVenues(rows, 'balanced'))).toEqual(['A', 'C', 'X'])
  })

  it('sorts for the venue filters', () => {
    expect(ids(sortVenues(rows, 'rating'))).toEqual(['C', 'A', 'X'])
    expect(ids(sortVenues(rows, 'avg'))).toEqual(['A', 'C', 'X'])
    expect(ids(sortVenues(rows, 'max'))).toEqual(['C', 'A', 'X'])
    expect(ids(sortVenues(rows, 'distance'))).toEqual(['C', 'A', 'X'])
    expect(ids(sortVenues(rows, 'recommended', 'fair'))).toEqual(['C', 'A', 'X'])
  })

  it('applies a changed travel limit to stored rows', () => {
    const ranked = rankVenues(rows, 'balanced', { maxTravelSeconds: 1450 })
    expect(ids(ranked)).toEqual(['C', 'A', 'X'])
    expect(ranked[1].within_limit).toBe(false)
  })
})

describe('explanations', () => {
  it('formats minutes', () => {
    expect(formatMinutes(1500)).toBe('25 min')
    expect(formatMinutes(3900)).toBe('1 h 5 min')
    expect(formatMinutes(7200)).toBe('2 h')
    expect(formatMinutes(10)).toBe('under 1 min')
    expect(formatMinutes(null)).toBe('')
  })

  it('explains the fair winner from its numbers only', () => {
    const [top] = rankVenues(specVenues(), 'fair')
    const text = explainVenue(top, { strategy: 'fair', venuesConsidered: 18 })
    expect(text).toContain('Everyone can get here within about 24 min')
    expect(text).toContain('of the 18 venues Meetzy compared')
    expect(text).toContain('Trips differ by only 4 min.')
  })

  it('does not claim "best" for a venue that is not ranked first', () => {
    const ranked = rankVenues(specVenues(), 'balanced')
    const text = explainVenue(ranked[1], { strategy: 'balanced', venuesConsidered: 3 })
    expect(text).not.toContain('lowest')
  })

  it('names the friends without a route', () => {
    const venue = { rank: 1, summary: summarizeTimes([min(10), null, min(12), min(9)], 4) }
    const text = explainVenue(venue, {
      strategy: 'fair',
      venuesConsidered: 5,
      participants: [
        { userId: 'u1', name: 'Aarav' },
        { userId: 'u2', name: 'Priya' },
        { userId: 'u3', name: 'Maya' },
        { userId: 'u4', name: 'Sam' },
      ],
      routes: [
        { userId: 'u1', durationSeconds: min(10) },
        { userId: 'u2', durationSeconds: null },
        { userId: 'u3', durationSeconds: min(12) },
        { userId: 'u4', durationSeconds: min(9) },
      ],
    })
    expect(text).toContain('No route was found for Priya, so this is based on 3 of 4 friends.')
  })

  it('mentions the travel limit when it is exceeded', () => {
    const venue = { rank: 2, summary: summarizeTimes([min(40), min(20)], 2, min(30)) }
    expect(explainVenue(venue, { strategy: 'fastest', maxTravelSeconds: min(30) })).toContain('longer than your 30 min limit')
  })

  it('explains the chosen area', () => {
    const area = { kind: 'median', summary: summarizeTimes([min(20), min(22)], 2) }
    const text = explainArea(area, { strategy: 'fair', candidatesConsidered: 7, travelMode: 'TRANSIT' })
    expect(text).toBe(
      'Meetzy compared 7 possible meeting areas using real public transport times and chose the point closest to everyone overall, where everyone can reach it within about 22 min.',
    )
  })
})
