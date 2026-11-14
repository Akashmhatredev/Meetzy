<script setup>
/**
 * The interactive group map: friends (avatar pins in their route colour),
 * the optimised meeting area, candidate venues and per-friend routes.
 * Markers are diffed by key so realtime updates don't flash the map.
 */
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { Maximize } from 'lucide-vue-next'
import MapCanvas from './MapCanvas.vue'
import { memberPin, meetingPin, venuePin, memberInfo, venueInfo } from '@/services/googleMaps/markers'
import { decodePolyline } from '@/utils/domain'
import { duration, distance } from '@/utils/format'

const props = defineProps({
  people: { type: Array, default: () => [] }, // [{ userId, name, avatarUrl, color, isYou, location }]
  meetingPoint: { type: Object, default: null }, // { lat, lng }
  venues: { type: Array, default: () => [] }, // DB venue rows (ranked)
  selectedVenueId: { type: String, default: null },
  finalVenueId: { type: String, default: null },
  routes: { type: Array, default: () => [] }, // venue_routes rows for the selected venue
  height: { type: String, default: '24rem' },
  showRoutes: { type: Boolean, default: true },
  label: { type: String, default: 'Group map' },
})
const emit = defineEmits(['select-venue'])

const ctx = shallowRef(null)
const markers = new Map() // key -> { marker, listener }
let polylines = []
let info = null
let fittedOnce = false

function onReady(value) {
  // Theme switches rebuild the map: drop references to the old one.
  clearAll()
  fittedOnce = false
  ctx.value = value
  info = new value.libs.InfoWindow()
  sync()
}

function travelFor(userId) {
  const r = props.routes.find((x) => x.user_id === userId)
  if (!r) return null
  if (r.travel_time_seconds == null) return 'No route found'
  return `${duration(r.travel_time_seconds)} · ${distance(r.distance_meters)} to the selected venue`
}

function upsert(key, position, build, onClick, zIndex = 1) {
  const { AdvancedMarkerElement } = ctx.value.libs
  const existing = markers.get(key)
  if (existing) {
    existing.marker.position = position
    existing.marker.content = build()
    existing.marker.zIndex = zIndex
    existing.seen = true
    return
  }
  const marker = new AdvancedMarkerElement({
    map: ctx.value.map,
    position,
    content: build(),
    zIndex,
    gmpClickable: !!onClick,
  })
  const listener = onClick ? marker.addListener('click', () => onClick(marker)) : null
  markers.set(key, { marker, listener, seen: true })
}

function sync() {
  if (!ctx.value) return
  for (const entry of markers.values()) entry.seen = false

  for (const p of props.people) {
    if (!p.location) continue
    const position = { lat: p.location.latitude, lng: p.location.longitude }
    upsert(
      `m:${p.userId}`,
      position,
      () => memberPin(p),
      (marker) => {
        info.setContent(memberInfo({ name: p.isYou ? `${p.name} (you)` : p.name, address: p.location.formatted_address || p.location.label, travel: travelFor(p.userId) }))
        info.open({ map: ctx.value.map, anchor: marker })
      },
      10,
    )
  }

  if (props.meetingPoint) {
    upsert('meeting', props.meetingPoint, () => meetingPin(), null, 5)
  }

  props.venues.forEach((v, index) => {
    if (v.latitude == null) return
    const selected = v.id === props.selectedVenueId
    const final = v.id === props.finalVenueId
    upsert(
      `v:${v.id}`,
      { lat: v.latitude, lng: v.longitude },
      () => venuePin({ rank: v.rank ?? index + 1, selected, final, label: v.name }),
      (marker) => {
        emit('select-venue', v.id)
        info.setContent(venueInfo({ name: v.name, address: v.address, detail: v.max_travel_seconds != null ? `Everyone within ${duration(v.max_travel_seconds)}` : null }))
        info.open({ map: ctx.value.map, anchor: marker })
      },
      selected || final ? 20 : 8,
    )
  })

  for (const [key, entry] of markers) {
    if (!entry.seen) {
      entry.listener?.remove()
      entry.marker.map = null
      markers.delete(key)
    }
  }
  drawRoutes()
  if (!fittedOnce) {
    fit()
    fittedOnce = markers.size > 0
  }
}

function drawRoutes() {
  polylines.forEach((l) => l.setMap(null))
  polylines = []
  if (!props.showRoutes || !ctx.value) return
  for (const r of props.routes) {
    if (!r.polyline) continue
    const person = props.people.find((p) => p.userId === r.user_id)
    const line = new ctx.value.libs.Polyline({
      path: decodePolyline(r.polyline),
      strokeColor: person?.color ?? '#3a4a66',
      strokeOpacity: 0.9,
      strokeWeight: 5,
      map: ctx.value.map,
      zIndex: 2,
    })
    polylines.push(line)
  }
}

function fit() {
  if (!ctx.value || !markers.size) return
  const bounds = new ctx.value.libs.LatLngBounds()
  for (const { marker } of markers.values()) bounds.extend(marker.position)
  if (markers.size === 1) {
    ctx.value.map.setCenter(bounds.getCenter())
    ctx.value.map.setZoom(14)
  } else {
    ctx.value.map.fitBounds(bounds, 64)
  }
}

function clearAll() {
  for (const entry of markers.values()) {
    entry.listener?.remove()
    entry.marker.map = null
  }
  markers.clear()
  polylines.forEach((l) => l.setMap(null))
  polylines = []
  info?.close()
}

watch(
  () => [props.people, props.meetingPoint, props.venues, props.selectedVenueId, props.finalVenueId],
  sync,
  { deep: true },
)
watch(() => [props.routes, props.showRoutes], drawRoutes, { deep: true })

// Pan to a venue when it is selected from the list.
watch(
  () => props.selectedVenueId,
  (id) => {
    const v = props.venues.find((x) => x.id === id)
    if (v?.latitude != null && ctx.value) ctx.value.map.panTo({ lat: v.latitude, lng: v.longitude })
  },
)

onBeforeUnmount(clearAll)
defineExpose({ fit })
</script>

<template>
  <MapCanvas :height="height" :label="label" gesture="greedy" @ready="onReady">
    <template #overlay>
      <button
        type="button"
        class="absolute top-3 left-3 z-10 flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm font-semibold text-ink shadow-soft hover:bg-surface-2"
        @click="fit"
      >
        <Maximize :size="16" aria-hidden="true" /> Fit everyone
      </button>
      <slot name="overlay" />
    </template>
  </MapCanvas>
</template>
