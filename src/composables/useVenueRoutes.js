import { computed, ref, watch } from 'vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { AppError } from '@/utils/errors'

/**
 * Track the venue selected on a map and fetch its drawn routes on demand.
 * Routes come from the venue-routes Edge Function (server-side key) and
 * are cached in the database, so re-selecting a venue is free.
 */
export function useVenueRoutes(initialId = null, { auto = true } = {}) {
  const h = useHangoutStore()
  const ui = useUiStore()
  const selectedId = ref(initialId)
  const loadingRoutes = ref(false)
  const routeError = ref(null)

  const selectedRoutes = computed(() => (selectedId.value ? h.routesByVenue.get(selectedId.value) ?? [] : []))

  async function load(id = selectedId.value, opts = {}) {
    if (!id) return
    loadingRoutes.value = true
    routeError.value = null
    try {
      await h.loadRoutes(id, opts)
    } catch (e) {
      routeError.value = AppError.from(e)
      if (routeError.value.code !== 'not_configured') ui.error(routeError.value.message)
    } finally {
      loadingRoutes.value = false
    }
  }

  if (auto) watch(selectedId, (id) => id && load(id))

  return { selectedId, selectedRoutes, loadingRoutes, routeError, load }
}
