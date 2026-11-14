/**
 * Address search with Places API (New) through the Maps JavaScript API's
 * AutocompleteSuggestion data API, so the dropdown can match Meetzy's design.
 * One session token spans a search and its final place lookup (billing).
 */
import { importLibrary } from '@/services/googleMaps/loader'

let placesLib = null
async function places() {
  placesLib ??= await importLibrary('places')
  return placesLib
}

export async function createSessionToken() {
  const { AutocompleteSessionToken } = await places()
  return new AutocompleteSessionToken()
}

/**
 * @returns {Promise<Array<{ id: string, primary: string, secondary: string, prediction: object }>>}
 */
export async function fetchSuggestions(input, { sessionToken, near } = {}) {
  const text = input.trim()
  if (text.length < 3) return []
  const { AutocompleteSuggestion } = await places()
  const request = { input: text, sessionToken }
  if (near) {
    request.locationBias = { center: { lat: near.lat, lng: near.lng }, radius: 30000 }
  }
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
  return suggestions
    .filter((s) => s.placePrediction)
    .slice(0, 6)
    .map((s) => ({
      id: s.placePrediction.placeId,
      primary: s.placePrediction.mainText?.toString() ?? s.placePrediction.text.toString(),
      secondary: s.placePrediction.secondaryText?.toString() ?? '',
      prediction: s.placePrediction,
    }))
}

/** Resolve a suggestion to coordinates and a formatted address. */
export async function resolveSuggestion(suggestion) {
  const place = suggestion.prediction.toPlace()
  await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] })
  return {
    placeId: place.id,
    name: place.displayName ?? suggestion.primary,
    address: place.formattedAddress ?? `${suggestion.primary}, ${suggestion.secondary}`,
    lat: place.location.lat(),
    lng: place.location.lng(),
  }
}
