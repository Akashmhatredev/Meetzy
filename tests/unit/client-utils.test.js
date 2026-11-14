import { describe, expect, it } from 'vitest'
import { duration, distance, initials, priceLevel, toLocalInput, fromLocalInput } from '../../src/utils/format.js'
import { email, newPassword, inviteCode, normalizeInviteCode, required } from '../../src/utils/validation.js'
import { AppError, errorMessage } from '../../src/utils/errors.js'
import { hangoutIcs } from '../../src/utils/calendar.js'

// domain.js imports lucide components (Vue); test the pure helpers through a
// light dynamic import so the suite stays in the node environment.
const { decodePolyline, directionsUrl, memberColor, MEMBER_COLORS, travelMode } = await import('../../src/utils/domain.js')

describe('format', () => {
  it('formats durations honestly', () => {
    expect(duration(null)).toBe('—')
    expect(duration(20)).toBe('1 min')
    expect(duration(1500)).toBe('25 min')
    expect(duration(3600)).toBe('1 h')
    expect(duration(3900)).toBe('1 h 5 min')
  })
  it('formats distances', () => {
    expect(distance(null)).toBe('—')
    expect(distance(444)).toBe('440 m')
    expect(distance(1234)).toBe('1.2 km')
    expect(distance(15400)).toBe('15 km')
  })
  it('builds initials', () => {
    expect(initials('Maya Patel')).toBe('MP')
    expect(initials('  arjun ')).toBe('A')
    expect(initials('')).toBe('?')
  })
  it('maps Google price levels without inventing prices', () => {
    expect(priceLevel('PRICE_LEVEL_MODERATE').rank).toBe(2)
    expect(priceLevel('PRICE_LEVEL_UNSPECIFIED')).toBeNull()
    expect(priceLevel(null)).toBeNull()
  })
  it('round-trips datetime-local values', () => {
    const iso = fromLocalInput('2026-12-01T18:30')
    expect(toLocalInput(iso)).toBe('2026-12-01T18:30')
    expect(fromLocalInput('')).toBeNull()
  })
})

describe('validation', () => {
  it('validates emails and passwords', () => {
    expect(email('a@b.co')).toBe('')
    expect(email('a@b')).not.toBe('')
    expect(newPassword('short1')).not.toBe('')
    expect(newPassword('longenough')).toMatch(/number/)
    expect(newPassword('longenough1')).toBe('')
  })
  it('accepts invite links and messy codes', () => {
    expect(normalizeInviteCode('https://meetzy.app/join/k7qm4tzp')).toBe('K7QM4TZP')
    expect(normalizeInviteCode('k7qm-4tzp')).toBe('K7QM4TZP')
    expect(inviteCode('K7QM4TZP')).toBe('')
    expect(inviteCode('K7QM4TZ0')).not.toBe('') // 0 is not in the alphabet
    expect(inviteCode('')).not.toBe('')
  })
  it('checks lengths', () => {
    const name = required('Group name', 2, 50)
    expect(name('a')).toMatch(/at least 2/)
    expect(name('ok')).toBe('')
    expect(name('x'.repeat(51))).toMatch(/at most 50/)
  })
})

describe('errors', () => {
  it('maps RPC codes to friendly messages, preferring the database detail', () => {
    const err = AppError.from({ message: 'rate_limited', details: 'Try again in about 3 minute(s).' })
    expect(err.code).toBe('rate_limited')
    expect(err.message).toBe('Try again in about 3 minute(s).')
    expect(AppError.from({ message: 'hangout_closed' }).message).toMatch(/closed/)
  })
  it('maps permission errors and auth messages', () => {
    expect(AppError.from({ code: '42501', message: 'permission denied for table venues' }).code).toBe('forbidden')
    expect(errorMessage({ message: 'Invalid login credentials' })).toBe('Wrong email or password.')
    expect(AppError.from({ message: 'Failed to fetch' }).code).toBe('network')
  })
})

describe('domain helpers', () => {
  it('decodes Google encoded polylines', () => {
    // Example from Google's polyline documentation.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ])
  })
  it('builds Google Maps directions URLs', () => {
    const url = new URL(
      directionsUrl({
        venue: { latitude: 18.52, longitude: 73.84, google_place_id: 'ChIJabc' },
        origin: { latitude: 18.6, longitude: 73.7 },
        travelMode: 'TWO_WHEELER',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('destination')).toBe('18.52,73.84')
    expect(url.searchParams.get('destination_place_id')).toBe('ChIJabc')
    expect(url.searchParams.get('origin')).toBe('18.6,73.7')
    expect(url.searchParams.get('travelmode')).toBe('two-wheeler')
  })
  it('cycles member colours and falls back to driving', () => {
    expect(memberColor(MEMBER_COLORS.length)).toBe(MEMBER_COLORS[0])
    expect(travelMode('NOPE').value).toBe('DRIVE')
  })
})

describe('calendar', () => {
  it('builds a valid iCalendar event with escaped text', () => {
    const ics = hangoutIcs({ id: 'h1', title: 'Dinner, finally', start: '2026-12-01T13:00:00Z', location: 'Cafe; FC Road' })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20261201T130000Z')
    expect(ics).toContain('DTEND:20261201T150000Z')
    expect(ics).toContain('SUMMARY:Dinner\\, finally')
    expect(ics).toContain('LOCATION:Cafe\\; FC Road')
  })
})

describe('safeRedirect', async () => {
  const { safeRedirect } = await import('../../src/utils/redirect.js')
  it('allows in-app paths only', () => {
    expect(safeRedirect('/hangouts/abc/vote')).toBe('/hangouts/abc/vote')
    expect(safeRedirect('//evil.example')).toBe('/home')
    expect(safeRedirect('https://evil.example')).toBe('/home')
    expect(safeRedirect('/\\evil.example')).toBe('/home')
    expect(safeRedirect(undefined)).toBe('/home')
  })
})
