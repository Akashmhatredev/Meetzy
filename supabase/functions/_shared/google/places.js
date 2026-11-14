/**
 * Google Places API (New) REST client. Server-side only.
 * Results are normalised; fields Google leaves out stay null.
 */
import { EngineError } from '../engine/errors.js'
import { googleFetch } from './errors.js'

export const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText'
export const PLACES_BASE_URL = 'https://places.googleapis.com/v1'

const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'primaryType',
  'primaryTypeDisplayName',
  'googleMapsUri',
  'photos',
  'regularOpeningHours.weekdayDescriptions',
  'currentOpeningHours.openNow',
  'businessStatus',
]

export const SEARCH_FIELD_MASK = PLACE_FIELDS.map((f) => `places.${f}`).join(',')
export const DETAILS_FIELD_MASK = PLACE_FIELDS.join(',')

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,300}$/
const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/

/** Places API (New) Place -> Meetzy venue fields. */
export function normalizePlace(place) {
  if (!place?.id) return null
  const photo = Array.isArray(place.photos) ? place.photos[0] : null
  return {
    placeId: place.id,
    name: place.displayName?.text ?? null,
    address: place.formattedAddress ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    ratingCount: Number.isInteger(place.userRatingCount) ? place.userRatingCount : null,
    priceLevel: place.priceLevel ?? null,
    primaryType: place.primaryType ?? null,
    primaryTypeLabel: place.primaryTypeDisplayName?.text ?? null,
    googleMapsUri: place.googleMapsUri ?? null,
    photoName: photo?.name ?? null,
    photoAttributions: (photo?.authorAttributions ?? [])
      .filter((a) => a?.displayName)
      .map((a) => ({ displayName: a.displayName, uri: a.uri ?? null })),
    openingHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
    openNow: typeof place.currentOpeningHours?.openNow === 'boolean' ? place.currentOpeningHours.openNow : null,
    businessStatus: place.businessStatus ?? null,
  }
}

/**
 * Text Search biased to a circle around the meeting area.
 * @returns {Promise<object[]>} normalised places in Google's relevance order
 */
export async function searchText({ apiKey, fetch, textQuery, center, radiusMeters, pageSize = 10, languageCode }) {
  const body = {
    textQuery,
    pageSize,
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.min(50000, Math.max(1, Math.round(radiusMeters))),
      },
    },
  }
  if (languageCode) body.languageCode = languageCode
  const response = await googleFetch(fetch, 'Places', SEARCH_TEXT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  return (data?.places ?? []).map(normalizePlace).filter(Boolean)
}

/**
 * Resolves a photo resource name to a short-lived googleusercontent URL
 * (skipHttpRedirect), so the browser never needs an API key for photos.
 */
export async function getPhotoUri({ apiKey, fetch, photoName, maxWidthPx = 640 }) {
  if (!PHOTO_NAME_PATTERN.test(photoName ?? '')) return null
  const url = `${PLACES_BASE_URL}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`
  const response = await googleFetch(fetch, 'Places', url, {
    method: 'GET',
    headers: { 'X-Goog-Api-Key': apiKey },
  })
  const data = await response.json()
  return typeof data?.photoUri === 'string' ? data.photoUri : null
}

/** Fresh details for one place (used to refresh purged or stale venue content). */
export async function getPlaceDetails({ apiKey, fetch, placeId }) {
  if (!PLACE_ID_PATTERN.test(placeId ?? '')) {
    throw new EngineError('invalid_request', 'Invalid place id.', 400)
  }
  const response = await googleFetch(fetch, 'Places', `${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
  })
  return normalizePlace(await response.json())
}
