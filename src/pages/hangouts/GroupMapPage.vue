<script setup>
import { computed, ref } from 'vue'
import { Map as MapIcon, List, MapPin, Navigation, LoaderCircle } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import GroupMap from '@/components/maps/GroupMap.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useVenueRoutes } from '@/composables/useVenueRoutes'
import { directionsUrl } from '@/utils/domain'
import { duration, distance } from '@/utils/format'

const h = useHangoutStore()
const view = ref('map')
const { selectedId, selectedRoutes, loadingRoutes } = useVenueRoutes(h.hangout.selected_venue_id ?? null)

const meetingPoint = computed(() =>
  h.hangout.meeting_point_lat != null ? { lat: h.hangout.meeting_point_lat, lng: h.hangout.meeting_point_lng } : null,
)
const venues = computed(() => h.rankedVenues.slice(0, 10))
const selected = computed(() => h.venues.find((v) => v.id === selectedId.value) ?? null)
const routeFor = (userId) => selectedRoutes.value.find((r) => r.user_id === userId) ?? null
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold">Group map</h2>
        <p class="text-sm text-ink-soft">{{ h.participants.length }} of {{ h.people.length }} friends on the map{{ venues.length ? ` · ${venues.length} top venues` : '' }}</p>
      </div>
      <SegmentedControl v-model="view" size="sm" label="View" class="!w-auto lg:hidden" :options="[{ value: 'map', label: 'Map', icon: MapIcon }, { value: 'list', label: 'List', icon: List }]" />
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div :class="view === 'list' && 'hidden lg:block'">
        <GroupMap
          :people="h.people"
          :meeting-point="meetingPoint"
          :venues="venues"
          :selected-venue-id="selectedId"
          :final-venue-id="h.hangout.selected_venue_id"
          :routes="selectedRoutes"
          height="min(72dvh, 42rem)"
          @select-venue="selectedId = $event"
        >
          <template #overlay>
            <span v-if="loadingRoutes" class="absolute top-3 right-14 z-10 flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs font-semibold shadow-soft">
              <LoaderCircle :size="14" class="animate-spin" aria-hidden="true" /> Drawing routes…
            </span>
          </template>
        </GroupMap>
        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-ink-soft">
          <span v-for="p in h.participants" :key="p.userId" class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full" :style="{ background: p.color }" />{{ p.isYou ? 'You' : p.name }}</span>
          <span v-if="meetingPoint" class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full border-2 border-dashed border-mint-600" />Meeting area</span>
        </div>
      </div>

      <aside class="space-y-4" :class="view === 'map' && 'hidden lg:block'">
        <section class="card card-pad">
          <h3 class="font-bold">{{ selected ? `Trips to ${selected.name}` : 'Friends' }}</h3>
          <p v-if="!selected && venues.length" class="mt-1 text-sm text-muted">Tap a venue pin to draw everyone's route.</p>
          <ul class="mt-3 space-y-3">
            <li v-for="p in h.people" :key="p.userId" class="flex items-center gap-3">
              <UserAvatar :name="p.name" :src="p.avatarUrl" :size="38" :color="p.location ? p.color : null" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ p.name }}<span v-if="p.isYou" class="font-normal text-muted"> (you)</span></p>
                <p class="truncate text-xs text-muted">
                  <template v-if="!p.location">Hasn't shared a location</template>
                  <template v-else>{{ p.location.formatted_address || p.location.label }}</template>
                </p>
              </div>
              <span v-if="selected && p.location" class="text-right text-sm font-semibold tabular-nums">
                <template v-if="routeFor(p.userId)?.travel_time_seconds != null">
                  {{ duration(routeFor(p.userId).travel_time_seconds) }}
                  <span class="block text-xs font-normal text-muted">{{ distance(routeFor(p.userId).distance_meters) }}</span>
                </template>
                <span v-else class="text-xs text-warn">{{ routeFor(p.userId) ? 'No route' : '—' }}</span>
              </span>
            </li>
          </ul>
          <BaseButton
            v-if="selected"
            class="mt-4"
            block
            variant="secondary"
            :icon="Navigation"
            :href="directionsUrl({ venue: selected, origin: h.myLocation, travelMode: h.hangout.travel_mode })"
            target="_blank"
            rel="noopener noreferrer"
            >My directions</BaseButton
          >
        </section>
        <section v-if="venues.length" class="card card-pad">
          <h3 class="mb-2 font-bold">Top venues</h3>
          <ul class="space-y-1">
            <li v-for="v in venues" :key="v.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors"
                :class="selectedId === v.id ? 'bg-accent-soft' : 'hover:bg-surface-2'"
                @click="selectedId = v.id"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-navy-900 font-display text-xs font-extrabold dark:border-white">{{ v.rank }}</span>
                <span class="min-w-0 flex-1 truncate font-semibold">{{ v.name }}</span>
                <span class="text-xs text-muted tabular-nums">≤ {{ duration(v.max_travel_seconds) }}</span>
              </button>
            </li>
          </ul>
        </section>
        <BaseButton v-if="!h.myLocation && h.isOpen" block :icon="MapPin" :to="{ name: 'hangout-location', params: { hangoutId: h.hangoutId } }">Share my location</BaseButton>
      </aside>
    </div>
  </div>
</template>
