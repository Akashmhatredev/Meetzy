import { ref } from 'vue'
import { AppError } from '@/utils/errors'

/**
 * One-shot browser geolocation, only when the user presses a button.
 * Meetzy never watches position in the background.
 */
export function useGeolocation() {
  const locating = ref(false)

  function locate({ timeout = 12000 } = {}) {
    if (!('geolocation' in navigator)) {
      return Promise.reject(new AppError('geolocation_unavailable'))
    }
    locating.value = true
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locating.value = false
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        },
        (err) => {
          locating.value = false
          reject(new AppError(err.code === err.PERMISSION_DENIED ? 'geolocation_denied' : 'geolocation_unavailable'))
        },
        { enableHighAccuracy: true, timeout, maximumAge: 60000 },
      )
    })
  }

  return { locating, locate }
}
