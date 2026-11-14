<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Map as MapIcon, List, Columns3, Store, X, LoaderCircle, ArrowRight } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import GroupMap from '@/components/maps/GroupMap.vue'
import VenueCard from '@/components/venues/VenueCard.vue'
import GoogleAttribution from '@/components/venues/GoogleAttribution.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { useVenueRoutes } from '@/composables/useVenueRoutes'
import { sortVenues, bestBalancedId, summaryOf } from '@/services/midpoint'
import { PRICE_LEVELS } from '@/utils/format'
import { errorMessage } from '@/utils/errors'

const h = useHangoutStore()
const ui = useUiStore()
const router = useRouter()
const { selectedId, selectedRoutes, loadingRoutes } = useVenueRoutes(h.rankedVenues[0]?.id ?? null)

const view = ref('list') // mobile only: list | map
const sort = ref('recommended')
const price = ref('any')
const activity = ref('all')
const openOnly = ref(false)
const compare = ref([])

const SORTS = [
  { value: 'recommended', label: 'Recommended (your strategy)' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'avg', label: 'Lowest average travel' },
  { value: 'max', label: 'Lowest longest trip' },
  { value: 'distance', label: 'Closest to the meeting area' },
]
const PRICES = [
  { value: 'any', label: 'Any price' },
  ...Object.entries(PRICE_LEVELS).map(([value, info]) => ({ value, label: info.label })),
]

const rankById = computed(() => new Map(h.rankedVenues.map((v) => [v.id, v.rank])))
const activityOptions = computed(() => {
  const ids = [...new Set(h.venues.map((v) => v.activity_id).filter(Boolean))]
  return [
    { value: 'all', label: 'All activities' },
    ...ids.map((id) => ({ value: id, label: (h.catalogue.find((a) => a.id === id) ?? h.activities.find((a) => a.id === id))?.name ?? 'Activity' })),
  ]
})

const list = computed(() => {
  const maxTravelSeconds = h.hangout.max_travel_minutes ? h.hangout.max_travel_minutes * 60 : null
  return sortVenues(h.venues, sort.value, h.hangout.optimization_strategy, { maxTravelSeconds }).filter(
    (v) =>
      (price.value === 'any' || v.price_level === price.value) &&
      (activity.value === 'all' || v.activity_id === activity.value) &&
      (!openOnly.value || v.open_now === true),
  )
})
const scale = computed(() => Math.max(1, ...h.routes.map((r) => r.travel_time_seconds ?? 0)))
const balanced = computed(() => bestBalancedId(h.venues))

function toggleCompare(id) {
  if (compare.value.includes(id)) compare.value = compare.value.filter((x) => x !== id)
  else if (compare.value.length >= 5) ui.toast('Compare up to 5 venues at a time.')
  else compare.value = [...compare.value, id]
}

async function vote(id) {
  try {
    if (h.myVenueVote === id) await h.clearVote()
    else await h.vote(id)
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

function goCompare() {
  router.push({ name: 'hangout-compare', params: { hangoutId: h.hangoutId }, query: { ids: compare.value.join(',') } })
}
function clearFilters() {
  price.value = 'any'
  activity.value = 'all'
  openOnly.value = false
}
const meetingPoint = computed(() => (h.hangout.meeting_point_lat != null ? { lat: h.hangout.meeting_point_lat, lng: h.hangout.meeting_point_lng } : null))
const anyComplete = computed(() => h.venues.some((v) => summaryOf(v).complete))
</script>

<template>
  <div>
    <div v-if="!h.venues.length" class="card">
      <EmptyState :icon="Store" title="No venues yet" description="Find the meeting point first. Meetzy then searches Google Places around it for your activities.">
        <BaseButton :to="{ name: 'hangout-meeting-point', params: { hangoutId: h.hangoutId } }">Find the meeting point</BaseButton>
      </EmptyState>
    </div>
    <template v-else>
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div class="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          <BaseSelect v-model="sort" :options="SORTS" label="Sort by" class="col-span-2 sm:col-span-1" />
          <BaseSelect v-model="activity" :options="activityOptions" label="Activity" />
          <BaseSelect v-model="price" :options="PRICES" label="Price" />
        </div>
        <label class="flex h-12 items-center gap-2 rounded-2xl border border-line-strong bg-surface px-4 text-sm font-semibold">
          <input v-model="openOnly" type="checkbox" class="h-4 w-4 accent-mint-600" /> Open now
        </label>
      </div>
      <div class="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <p class="text-sm text-muted">{{ list.length }} of {{ h.venues.length }} venues</p>
        <SegmentedControl v-model="view" size="sm" label="View" class="!w-auto" :options="[{ value: 'list', label: 'List', icon: List }, { value: 'map', label: 'Map', icon: MapIcon }]" />
      </div>
      <p v-if="!anyComplete" class="mb-4 rounded-2xl bg-warn-soft p-3 text-sm text-warn">Google couldn't route everyone to any venue. Rankings use partial data; consider another travel mode.</p>

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div :class="view === 'map' && 'hidden lg:block'">
          <p class="mb-3 hidden text-sm text-muted lg:block">{{ list.length }} of {{ h.venues.length }} venues · ranked by real travel times</p>
          <div v-if="!list.length" class="card">
            <EmptyState :icon="Store" title="No venues match these filters" compact>
              <BaseButton variant="secondary" @click="clearFilters">Clear filters</BaseButton>
            </EmptyState>
          </div>
          <TransitionGroup v-else tag="div" name="list" class="space-y-3">
            <VenueCard
              v-for="v in list"
              :key="v.id"
              :venue="v"
              :rank="rankById.get(v.id)"
              :selected="selectedId === v.id"
              :compare-selected="compare.includes(v.id)"
              :scale-seconds="scale"
              :balanced-pick="balanced === v.id"
              @select="selectedId = $event"
              @toggle-compare="toggleCompare"
              @vote="vote"
            />
          </TransitionGroup>
          <GoogleAttribution class="mt-4" />
        </div>
        <div :class="view === 'list' && 'hidden lg:block'">
          <div class="lg:sticky lg:top-6">
            <GroupMap
              :people="h.people"
              :meeting-point="meetingPoint"
              :venues="list"
              :selected-venue-id="selectedId"
              :final-venue-id="h.hangout.selected_venue_id"
              :routes="selectedRoutes"
              height="min(70dvh, 38rem)"
              label="Venues map"
              @select-venue="selectedId = $event"
            >
              <template #overlay>
                <span v-if="loadingRoutes" class="absolute top-3 right-14 z-10 flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs font-semibold shadow-soft">
                  <LoaderCircle :size="14" class="animate-spin" aria-hidden="true" /> Drawing routes…
                </span>
              </template>
            </GroupMap>
            <p class="mt-2 text-xs text-muted">Select a venue to draw everyone's route in their colour.</p>
          </div>
        </div>
      </div>

      <Transition name="fade">
        <div
          v-if="compare.length"
          class="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-navy-900 p-2 pl-4 text-white shadow-lift lg:bottom-6"
        >
          <Columns3 :size="18" class="text-mint-300" aria-hidden="true" />
          <span class="flex-1 text-sm font-semibold">{{ compare.length }} selected</span>
          <button type="button" class="rounded-lg p-2 text-navy-300 hover:text-white" aria-label="Clear comparison" @click="compare = []"><X :size="16" aria-hidden="true" /></button>
          <BaseButton size="sm" :disabled="compare.length < 2" @click="goCompare">Compare</BaseButton>
        </div>
      </Transition>

      <div class="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="secondary" :to="{ name: 'hangout-compare', params: { hangoutId: h.hangoutId } }">Compare top venues</BaseButton>
        <BaseButton :icon-right="ArrowRight" :to="{ name: 'hangout-vote', params: { hangoutId: h.hangoutId } }">Go to the vote</BaseButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.list-move {
  transition: transform 0.35s var(--ease-out-soft);
}
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s var(--ease-out-soft);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
