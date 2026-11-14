import { importLibrary } from './loader'

/**
 * Turn a dropped pin or GPS fix into a readable address. Needs the Geocoding
 * API on the browser key; when it isn't enabled we return null and the UI
 * labels the spot by its coordinates instead of inventing an address.
 */
export async function reverseGeocode({ lat, lng }) {
  try {
    const { Geocoder } = await importLibrary('geocoding')
    const { results } = await new Geocoder().geocode({ location: { lat, lng } })
    const best = results?.[0]
    if (!best) return null
    return { address: best.formatted_address, placeId: best.place_id }
  } catch {
    return null
  }
}

export function coordinateLabel({ lat, lng }) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
