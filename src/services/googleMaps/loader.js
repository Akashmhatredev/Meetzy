/**
 * Loads the Google Maps JavaScript API once, on demand, using the
 * recommended `loading=async` bootstrap, then exposes importLibrary().
 * Nothing Google-related is downloaded until a page actually needs a map.
 */
import { config, isMapsConfigured } from '@/services/config'
import { AppError } from '@/utils/errors'

let bootstrap = null

function loadScript() {
  if (bootstrap) return bootstrap
  bootstrap = new Promise((resolve, reject) => {
    if (!isMapsConfigured) {
      reject(new AppError('not_configured', 'Google Maps is not configured (VITE_GOOGLE_MAPS_API_KEY).'))
      return
    }
    if (window.google?.maps?.importLibrary) {
      resolve(window.google.maps)
      return
    }
    const callbackName = '__meetzyMapsReady'
    window[callbackName] = () => {
      delete window[callbackName]
      resolve(window.google.maps)
    }
    // Google calls this when the key is rejected (referrer, billing, API not enabled).
    window.gm_authFailure = () => {
      window.dispatchEvent(new CustomEvent('meetzy:maps-auth-failure'))
    }
    const params = new URLSearchParams({
      key: config.mapsApiKey,
      v: 'weekly',
      loading: 'async',
      callback: callbackName,
      language: navigator.language || 'en',
    })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => {
      bootstrap = null
      reject(new AppError('maps_unavailable', "Google Maps couldn't load. Check your connection."))
    }
    document.head.append(script)
  })
  return bootstrap
}

/** importLibrary('maps' | 'marker' | 'places' | 'geocoding' | 'core') */
export async function importLibrary(name) {
  const maps = await loadScript()
  return maps.importLibrary(name)
}

export async function loadMaps(...libraries) {
  const loaded = await Promise.all(libraries.map((name) => importLibrary(name)))
  return Object.assign({}, ...loaded)
}
