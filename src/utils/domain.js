/**
 * Meetzy domain vocabulary shared by pages: travel modes, hangout statuses,
 * member colours, group colours and the planning steps.
 */
import { Car, Bike, Bus, Footprints, Motorbike } from 'lucide-vue-next'

/**
 * Google Routes API travel modes. Two-wheeler and transit depend on region;
 * cycling is a Google beta. We say so instead of pretending.
 */
export const TRAVEL_MODES = [
  {
    value: 'DRIVE',
    label: 'Driving',
    short: 'Car',
    icon: Car,
    mapsUrlMode: 'driving',
    note: 'Traffic-aware when a time is set.',
  },
  {
    value: 'TWO_WHEELER',
    label: 'Two-wheeler',
    short: 'Bike',
    icon: Motorbike,
    mapsUrlMode: 'two-wheeler',
    note: 'Motorbikes and scooters. Google supports this in selected countries (including India); elsewhere it may return no routes, so pick Driving instead.',
  },
  {
    value: 'TRANSIT',
    label: 'Public transport',
    short: 'Transit',
    icon: Bus,
    mapsUrlMode: 'transit',
    note: 'Uses Google transit data where it exists. Smaller groups only (Google limits transit matrices).',
  },
  {
    value: 'WALK',
    label: 'Walking',
    short: 'Walk',
    icon: Footprints,
    mapsUrlMode: 'walking',
    note: 'Best when everyone is nearby.',
  },
  {
    value: 'BICYCLE',
    label: 'Cycling',
    short: 'Cycle',
    icon: Bike,
    mapsUrlMode: 'bicycling',
    note: 'Google beta: some routes may be missing paths. Meetzy shows when a route is unavailable.',
  },
]

export const travelMode = (value) => TRAVEL_MODES.find((m) => m.value === value) ?? TRAVEL_MODES[0]

export const HANGOUT_STATUS = {
  draft: { label: 'Draft', tone: 'slate' },
  waiting_for_locations: { label: 'Waiting for locations', tone: 'sky' },
  activity_selection: { label: 'Picking activities', tone: 'lavender' },
  calculating: { label: 'Calculating', tone: 'sun' },
  venue_discovery: { label: 'Venues found', tone: 'mint' },
  voting: { label: 'Voting', tone: 'sun' },
  finalized: { label: 'Finalised', tone: 'navy' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
}

export const isOpenStatus = (status) => !['finalized', 'cancelled'].includes(status)

/** Member colours for markers and routes (distinct, AA on white for text). */
export const MEMBER_COLORS = ['#1E9E6E', '#7C5CE6', '#2F7FD8', '#E07A16', '#D9466F', '#0E9AA0', '#B98900', '#5B6B85']

export function memberColor(index) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length]
}

export const GROUP_COLORS = {
  mint: { bg: 'bg-mint-100 dark:bg-mint-900/50', ring: 'ring-mint-300', hex: '#65d6a4' },
  lavender: { bg: 'bg-lavender-100 dark:bg-lavender-700/40', ring: 'ring-lavender-400', hex: '#a993f6' },
  sky: { bg: 'bg-sky-100 dark:bg-sky-700/40', ring: 'ring-sky-400', hex: '#6aa9f2' },
  orange: { bg: 'bg-sun-100 dark:bg-sun-700/40', ring: 'ring-sun-400', hex: '#ffa95a' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-700/40', ring: 'ring-rose-400', hex: '#f07d9c' },
  slate: { bg: 'bg-navy-100 dark:bg-navy-700/60', ring: 'ring-navy-300', hex: '#93a0b5' },
}

export const GROUP_EMOJIS = ['👋', '🎉', '☕', '🍕', '🎬', '🎳', '🏞️', '🛍️', '🎮', '🚴', '🏏', '✈️', '🎓', '💼', '🔥', '🌮']

export const ACTIVITY_CATEGORIES = [
  { value: 'food', label: 'Food' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
]

/** Planning steps shown on the hangout dashboard and stepper. */
export const HANGOUT_STEPS = [
  { key: 'locations', label: 'Locations', route: 'hangout-location' },
  { key: 'activities', label: 'Activities', route: 'hangout-activities' },
  { key: 'meeting', label: 'Meeting point', route: 'hangout-meeting-point' },
  { key: 'venues', label: 'Venues', route: 'hangout-venues' },
  { key: 'vote', label: 'Vote', route: 'hangout-vote' },
  { key: 'final', label: 'Meet', route: 'hangout-confirmed' },
]

/** Google Maps directions URL (Maps URLs API, no key needed). */
export function directionsUrl({ venue, origin, travelMode: mode }) {
  const params = new URLSearchParams({ api: '1' })
  if (venue.latitude != null) params.set('destination', `${venue.latitude},${venue.longitude}`)
  else params.set('destination', venue.name || venue.address || '')
  if (venue.google_place_id) params.set('destination_place_id', venue.google_place_id)
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`)
  const m = travelMode(mode).mapsUrlMode
  if (m) params.set('travelmode', m)
  return `https://www.google.com/maps/dir/?${params}`
}

/** Decode a Google encoded polyline into [{ lat, lng }]. */
export function decodePolyline(encoded) {
  const points = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0
      let shift = 0
      let byte
      do {
        byte = encoded.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}
