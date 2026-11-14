<script setup>
/**
 * Pick a location four ways: search an address, use the browser's current
 * position (on request), click the map, or drag the pin to fine-tune.
 * v-model: { lat, lng, address, placeId, source: 'search'|'current'|'pin' } | null
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { LocateFixed, MapPin } from 'lucide-vue-next'
import MapCanvas from './MapCanvas.vue'
import PlaceSearchInput from './PlaceSearchInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import { pickerPin } from '@/services/googleMaps/markers'
import { reverseGeocode, coordinateLabel } from '@/services/googleMaps/geocode'
import { useGeolocation } from '@/composables/useGeolocation'
import { isMapsConfigured } from '@/services/config'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const model = defineModel({ type: Object, default: null })
defineProps({
  height: { type: String, default: '18rem' },
})

const ui = useUiStore()
const { locating, locate } = useGeolocation()
const ctx = shallowRef(null)
let marker = null
let dragListener = null

const center = computed(() => (model.value ? { lat: model.value.lat, lng: model.value.lng } : undefined))

function onReady(value) {
  ctx.value = value
  marker = null
  placeMarker()
}

function placeMarker() {
  if (!ctx.value || !model.value) return
  const position = { lat: model.value.lat, lng: model.value.lng }
  if (!marker) {
    marker = new ctx.value.libs.AdvancedMarkerElement({
      map: ctx.value.map,
      position,
      content: pickerPin(),
      gmpDraggable: true,
      title: 'Drag to adjust',
    })
    dragListener = marker.addListener('dragend', () => {
      const p = marker.position
      const lat = typeof p.lat === 'function' ? p.lat() : p.lat
      const lng = typeof p.lng === 'function' ? p.lng() : p.lng
      setFromPoint({ lat, lng }, 'pin')
    })
  } else {
    marker.position = position
  }
  ctx.value.map.panTo(position)
  if (ctx.value.map.getZoom() < 14) ctx.value.map.setZoom(15)
}

async function setFromPoint(point, source) {
  model.value = { ...point, address: coordinateLabel(point), placeId: null, source }
  const found = await reverseGeocode(point)
  // Only apply if the user hasn't moved the pin again meanwhile.
  if (found && model.value?.lat === point.lat && model.value?.lng === point.lng) {
    model.value = { ...model.value, address: found.address, placeId: found.placeId }
  }
}

function onSearch(place) {
  model.value = { lat: place.lat, lng: place.lng, address: place.address, placeId: place.placeId, source: 'search', name: place.name }
}

async function useCurrent() {
  try {
    const pos = await locate()
    await setFromPoint({ lat: pos.lat, lng: pos.lng }, 'current')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

watch(model, placeMarker, { deep: true })

onBeforeUnmount(() => {
  dragListener?.remove()
  if (marker) marker.map = null
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-col gap-2 sm:flex-row">
      <div class="min-w-0 flex-1">
        <PlaceSearchInput :near="center" @select="onSearch" />
      </div>
      <BaseButton variant="secondary" :icon="LocateFixed" :loading="locating" @click="useCurrent">Use my location</BaseButton>
    </div>
    <MapCanvas :center="center" :zoom="center ? 15 : 11" :height="height" label="Location picker map" @ready="onReady" @click="(p) => setFromPoint(p, 'pin')" />
    <div v-if="model" class="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
      <MapPin :size="18" class="mt-px shrink-0 text-accent-ink" aria-hidden="true" />
      <div class="min-w-0">
        <p class="font-semibold">{{ model.address }}</p>
        <p class="text-muted">
          {{ isMapsConfigured ? 'Drag the pin or tap the map to adjust.' : 'Coordinates from your browser. Add a Maps key to see the map and an address.' }}
        </p>
      </div>
    </div>
  </div>
</template>
