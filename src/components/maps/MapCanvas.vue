<script setup>
/**
 * Lazy Google map. Loads the Maps JavaScript API on first use, follows the
 * app's light/dark theme, and hands the map to the parent via `ready`.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { MapPinned, LoaderCircle } from 'lucide-vue-next'
import ConfigRequired from '@/components/common/ConfigRequired.vue'
import { loadMaps } from '@/services/googleMaps/loader'
import { config, isMapsConfigured } from '@/services/config'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const props = defineProps({
  center: { type: Object, default: () => ({ lat: 18.5204, lng: 73.8567 }) },
  zoom: { type: Number, default: 12 },
  height: { type: String, default: '22rem' },
  rounded: { type: String, default: 'rounded-3xl' },
  gesture: { type: String, default: 'cooperative' },
  label: { type: String, default: 'Map' },
})
const emit = defineEmits(['ready', 'click'])

const ui = useUiStore()
const el = ref(null)
const map = shallowRef(null)
const status = ref(isMapsConfigured ? 'loading' : 'unconfigured')
const message = ref('')
let libs = null
let clickListener = null

async function create() {
  status.value = 'loading'
  try {
    libs = await loadMaps('core', 'maps', 'marker')
    const scheme = ui.isDark ? 'DARK' : 'LIGHT'
    map.value = new libs.Map(el.value, {
      center: props.center,
      zoom: props.zoom,
      mapId: config.mapsMapId,
      colorScheme: libs.ColorScheme?.[scheme] ?? scheme,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: props.gesture,
    })
    clickListener = map.value.addListener('click', (event) => {
      if (event.latLng) emit('click', { lat: event.latLng.lat(), lng: event.latLng.lng() })
    })
    status.value = 'ready'
    emit('ready', { map: map.value, libs })
  } catch (e) {
    status.value = e?.code === 'not_configured' ? 'unconfigured' : 'error'
    message.value = errorMessage(e)
  }
}

function onAuthFailure() {
  status.value = 'error'
  message.value =
    'Google rejected the Maps key. Check that Maps JavaScript API is enabled and this site is an allowed referrer.'
}

onMounted(() => {
  window.addEventListener('meetzy:maps-auth-failure', onAuthFailure)
  if (isMapsConfigured) create()
})

// colorScheme is fixed at creation; rebuild the map when the theme flips.
watch(
  () => ui.isDark,
  () => {
    if (status.value !== 'ready') return
    clickListener?.remove()
    map.value = null
    create()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('meetzy:maps-auth-failure', onAuthFailure)
  clickListener?.remove()
})

defineExpose({ map, retry: create })
</script>

<template>
  <div class="relative isolate overflow-hidden border border-line bg-surface-2" :class="rounded" :style="{ height }">
    <div v-show="status === 'ready'" ref="el" class="absolute inset-0" role="region" :aria-label="label" />
    <div v-if="status === 'loading'" class="absolute inset-0 flex items-center justify-center">
      <div class="skeleton absolute inset-0 !rounded-none" />
      <span class="relative flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold text-ink-soft shadow-soft">
        <LoaderCircle :size="16" class="animate-spin" aria-hidden="true" /> Loading Google Maps…
      </span>
    </div>
    <div v-else-if="status === 'unconfigured'" class="absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
      <ConfigRequired service="maps" compact />
    </div>
    <div v-else-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <MapPinned :size="28" class="text-muted" aria-hidden="true" />
      <p class="max-w-sm text-sm text-ink-soft">{{ message }}</p>
      <button type="button" class="link text-sm" @click="create">Try again</button>
    </div>
    <slot v-if="status === 'ready'" name="overlay" />
  </div>
</template>
