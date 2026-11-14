<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles, RefreshCw, Check, CircleAlert, Route, Users, MapPin, ArrowRight, Info, LoaderCircle, Crosshair } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import GroupMap from '@/components/maps/GroupMap.vue'
import StrategyPicker from '@/components/hangouts/StrategyPicker.vue'
import TravelModePicker from '@/components/hangouts/TravelModePicker.vue'
import NextStepBar from '@/components/hangouts/NextStepBar.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { STRATEGIES, formatMinutes } from '@/services/midpoint'
import { explainArea } from '@engine/explain.js'
import { haversineMeters } from '@engine/geo.js'
import { travelMode } from '@/utils/domain'
import { AppError } from '@/utils/errors'
import { distance, timeAgo, dateTime } from '@/utils/format'

const h = useHangoutStore()
const ui = useUiStore()
const router = useRouter()
const lastError = ref(null)

const run = computed(() => (h.run?.status === 'succeeded' && h.run.id === h.hangout.last_run_id ? h.run : null))
const failedRun = computed(() => (h.run?.status === 'failed' ? h.run : null))
const ready = computed(() => h.participants.length >= 2 && h.activities.length > 0)
const blockers = computed(() => {
  const list = []
  if (h.participants.length < 2) list.push({ text: 'At least two people need to share a location.', to: 'hangout-location', cta: 'Share location' })
  if (!h.activities.length) list.push({ text: 'Pick at least one activity to search for.', to: 'hangout-activities', cta: 'Pick activities' })
  return list
})
const busy = computed(() => h.calculating || h.hangout.status === 'calculating')

const meetingPoint = computed(() =>
  h.hangout.meeting_point_lat != null ? { lat: h.hangout.meeting_point_lat, lng: h.hangout.meeting_point_lng } : null,
)
const topVenues = computed(() => h.rankedVenues.slice(0, 5))

const areas = computed(() => {
  const list = Array.isArray(run.value?.area_metrics) ? run.value.area_metrics : []
  const key = { fair: 'max', balanced: 'avg', fastest: 'total' }[run.value?.strategy ?? 'fair']
  return list
    .map((a) => ({ ...a, chosen: a.lat === run.value.area_lat && a.lng === run.value.area_lng }))
    .sort((a, b) => (a.complete === b.complete ? (a[key] ?? Infinity) - (b[key] ?? Infinity) : a.complete ? -1 : 1))
})
const chosenArea = computed(() => areas.value.find((a) => a.chosen) ?? null)
const areaText = computed(() => {
  if (!run.value) return ''
  const a = chosenArea.value
  const participants = run.value.participant_count
  return explainArea(
    {
      kind: run.value.area_kind,
      // Only complete areas have a full summary; never guess how many were reachable.
      summary: a?.complete
        ? { avg: a.avg, max: a.max, total: a.total, complete: true, reachable: participants, participants }
        : undefined,
    },
    { strategy: run.value.strategy, candidatesConsidered: areas.value.length || 1, travelMode: run.value.travel_mode },
  )
})
const shiftFromCentre = computed(() => {
  if (!run.value?.center_lat || !run.value?.area_lat) return null
  return haversineMeters({ lat: run.value.center_lat, lng: run.value.center_lng }, { lat: run.value.area_lat, lng: run.value.area_lng })
})

async function calculate(force = false) {
  lastError.value = null
  try {
    const result = await h.calculate({ force })
    if (result?.cached) ui.toast('Nothing changed since the last run, so Meetzy reused those results (no new Google calls).')
    else ui.success(`Found ${result?.venueCount ?? 'new'} venues around the best meeting area.`)
  } catch (e) {
    lastError.value = AppError.from(e)
  }
}

async function patch(field, value) {
  try {
    await h.updateSettings({ [field]: value })
  } catch (e) {
    ui.error(AppError.from(e).message)
  }
}

const MAX_TRAVEL = [
  { value: null, label: 'No limit' },
  { value: 20, label: 'Up to 20 min' },
  { value: 30, label: 'Up to 30 min' },
  { value: 45, label: 'Up to 45 min' },
  { value: 60, label: 'Up to 1 hour' },
  { value: 90, label: 'Up to 1.5 hours' },
]
const PROCESS = [
  'Finding the geographic centre of everyone who shared',
  'Testing candidate areas with real Google travel times',
  'Searching Google Places for your activities',
  'Comparing every friend’s trip to every venue',
  'Ranking by your fairness strategy',
]
</script>

<template>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
    <section class="space-y-5">
      <!-- Results / status -->
      <div class="card overflow-hidden">
        <GroupMap :people="h.people" :meeting-point="meetingPoint" :venues="topVenues" height="20rem" label="Meeting point map" class="!rounded-none !border-0" />
        <div class="card-pad">
          <div v-if="busy" class="space-y-3" role="status" aria-live="polite">
            <p class="flex items-center gap-2 font-display text-lg font-bold"><LoaderCircle :size="20" class="animate-spin text-accent-ink" aria-hidden="true" /> Meetzy is working it out…</p>
            <ol class="space-y-1.5 text-sm text-ink-soft">
              <li v-for="step in PROCESS" :key="step" class="flex items-center gap-2"><span class="h-1.5 w-1.5 rounded-full bg-mint-500" aria-hidden="true" />{{ step }}</li>
            </ol>
            <p class="text-xs text-muted">Usually takes a few seconds.</p>
          </div>
          <template v-else-if="run">
            <p class="eyebrow">Meeting area found</p>
            <p class="mt-1.5 text-[0.9375rem] leading-relaxed">{{ areaText }}</p>
            <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div class="rounded-2xl bg-surface-2 p-3"><dt class="flex items-center gap-1 text-xs text-muted"><Users :size="13" aria-hidden="true" />Friends</dt><dd class="font-display text-lg font-bold">{{ run.participant_count }}</dd></div>
              <div class="rounded-2xl bg-surface-2 p-3"><dt class="flex items-center gap-1 text-xs text-muted"><Crosshair :size="13" aria-hidden="true" />Areas tested</dt><dd class="font-display text-lg font-bold">{{ areas.length || 1 }}</dd></div>
              <div class="rounded-2xl bg-surface-2 p-3"><dt class="flex items-center gap-1 text-xs text-muted"><MapPin :size="13" aria-hidden="true" />Venues checked</dt><dd class="font-display text-lg font-bold">{{ run.venues_considered ?? '—' }}</dd></div>
              <div class="rounded-2xl bg-surface-2 p-3"><dt class="flex items-center gap-1 text-xs text-muted"><Route :size="13" aria-hidden="true" />Routes</dt><dd class="font-display text-lg font-bold">{{ run.routes_requested ?? '—' }}</dd></div>
            </dl>
            <p v-if="shiftFromCentre != null" class="mt-3 text-sm text-ink-soft">
              <template v-if="shiftFromCentre > 150">The best area is {{ distance(shiftFromCentre) }} from the geographic centre, because real travel times beat straight lines.</template>
              <template v-else>The geographic centre also turned out to be the best area for real travel times.</template>
            </p>
            <ul v-if="run.warnings?.length || run.routes_failed" class="mt-3 space-y-1.5 text-sm text-warn">
              <li v-if="run.routes_failed" class="flex gap-2"><Info :size="16" class="mt-px shrink-0" aria-hidden="true" />Google had no route for {{ run.routes_failed }} trip(s). Those venues show the gap instead of a guess.</li>
              <li v-for="w in run.warnings" :key="w" class="flex gap-2"><Info :size="16" class="mt-px shrink-0" aria-hidden="true" />{{ w }}</li>
            </ul>
            <p class="mt-3 text-xs text-muted">
              Calculated {{ timeAgo(run.finished_at) }} for {{ travelMode(run.travel_mode).label.toLowerCase() }}{{ h.hangout.scheduled_for ? `, departing around ${dateTime(h.hangout.scheduled_for)}` : '' }}.
            </p>
          </template>
          <div v-else class="flex items-start gap-3">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lavender-100 text-lavender-700 dark:bg-lavender-700/30 dark:text-lavender-200"><Sparkles :size="22" aria-hidden="true" /></span>
            <div>
              <p class="font-display text-lg font-bold">Not calculated yet</p>
              <p class="text-sm text-ink-soft">Meetzy doesn't just average coordinates: it tests real routes for everyone, then finds venues where the trips are fair.</p>
            </div>
          </div>

          <div v-if="lastError || (failedRun && !busy && !run)" class="mt-4 flex gap-3 rounded-2xl bg-danger-soft p-4 text-sm" role="alert">
            <CircleAlert :size="18" class="mt-px shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p class="font-semibold text-danger">{{ lastError ? "Couldn't calculate" : 'The last calculation failed' }}</p>
              <p class="mt-0.5 text-ink-soft">{{ lastError?.message ?? failedRun?.error_message }}</p>
              <p v-if="lastError?.code === 'no_routes' || failedRun?.error_code === 'no_routes'" class="mt-1 text-ink-soft">Try a different travel mode: two-wheeler, transit and cycling aren't available everywhere.</p>
            </div>
          </div>

          <div v-if="h.isOpen" class="mt-5 flex flex-wrap gap-2">
            <BaseButton :icon="run ? RefreshCw : Sparkles" size="lg" :loading="busy" :disabled="!ready" @click="calculate(false)">
              {{ run ? (h.isStale ? 'Recalculate with changes' : 'Recalculate') : 'Find the meeting point' }}
            </BaseButton>
            <BaseButton v-if="run && !busy" variant="ghost" @click="calculate(true)">Refresh live travel times</BaseButton>
          </div>
        </div>
      </div>

      <section v-if="areas.length > 1" class="card card-pad">
        <h3 class="font-bold">Candidate areas compared</h3>
        <p class="mt-1 text-sm text-ink-soft">Travel times from every friend to each area Meetzy tested.</p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[22rem] text-sm">
            <thead>
              <tr class="text-left text-xs text-muted">
                <th class="py-2 pr-2 font-semibold">Area</th>
                <th class="py-2 pr-2 text-right font-semibold">Average</th>
                <th class="py-2 pr-2 text-right font-semibold">Longest</th>
                <th class="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="(a, i) in areas" :key="i" :class="a.chosen && 'font-semibold'">
                <td class="py-2 pr-2">
                  <span class="flex items-center gap-1.5">
                    <Check v-if="a.chosen" :size="14" class="text-accent-ink" aria-label="Chosen" />
                    {{ { centroid: 'Geographic centre', median: 'Closest to everyone', ring: 'Nearby area' }[a.kind] ?? 'Area' }}
                    <span v-if="!a.complete" class="text-xs font-normal text-warn">(route missing)</span>
                  </span>
                </td>
                <td class="py-2 pr-2 text-right tabular-nums">{{ formatMinutes(a.avg) }}</td>
                <td class="py-2 pr-2 text-right tabular-nums">{{ formatMinutes(a.max) }}</td>
                <td class="py-2 text-right tabular-nums">{{ formatMinutes(a.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <aside class="space-y-5">
      <section v-if="blockers.length && h.isOpen" class="card card-pad">
        <h3 class="font-bold">Before you calculate</h3>
        <ul class="mt-3 space-y-3">
          <li v-for="b in blockers" :key="b.to" class="flex items-start justify-between gap-3 text-sm">
            <span class="text-ink-soft">{{ b.text }}</span>
            <BaseButton size="sm" variant="secondary" :to="{ name: b.to, params: { hangoutId: h.hangoutId } }">{{ b.cta }}</BaseButton>
          </li>
        </ul>
      </section>
      <section class="card card-pad space-y-5">
        <div>
          <h3 class="font-bold">Fairness strategy</h3>
          <p class="mb-3 text-sm text-ink-soft">{{ h.canManage ? 'Changing it re-ranks venues instantly.' : `Set by the organiser: ${STRATEGIES[h.hangout.optimization_strategy].label}.` }}</p>
          <StrategyPicker :model-value="h.hangout.optimization_strategy" :disabled="!h.canManage || !h.isOpen" @update:model-value="(v) => patch('optimization_strategy', v)" />
        </div>
        <div>
          <h3 class="mb-3 font-bold">Travel mode</h3>
          <TravelModePicker v-if="h.canManage && h.isOpen" :model-value="h.hangout.travel_mode" @update:model-value="(v) => patch('travel_mode', v)" />
          <p v-else class="flex items-center gap-2 text-sm font-semibold"><component :is="travelMode(h.hangout.travel_mode).icon" :size="17" aria-hidden="true" /> {{ travelMode(h.hangout.travel_mode).label }}</p>
        </div>
        <BaseSelect
          v-if="h.canManage && h.isOpen"
          :model-value="h.hangout.max_travel_minutes"
          :options="MAX_TRAVEL"
          label="Longest acceptable trip"
          @update:model-value="(v) => patch('max_travel_minutes', v)"
        />
      </section>
    </aside>

    <div class="lg:col-span-2">
      <NextStepBar :hint="run ? `${h.venues.length} venues ranked` : ''">
        <BaseButton :icon-right="ArrowRight" :disabled="!h.venues.length" @click="router.push({ name: 'hangout-venues', params: { hangoutId: h.hangoutId } })">See venues</BaseButton>
      </NextStepBar>
    </div>
  </div>
</template>
