<script setup>
import { computed } from 'vue'
import { Star, ExternalLink, Clock, MapPin, Vote, Check, Crown, Scale } from 'lucide-vue-next'
import VenuePhoto from './VenuePhoto.vue'
import MemberTravelTimes from './MemberTravelTimes.vue'
import { useHangoutStore } from '@/stores/hangout'
import { summaryOf } from '@/services/midpoint'
import { duration, distance, priceLevel } from '@/utils/format'

const props = defineProps({
  venue: { type: Object, required: true },
  rank: { type: Number, default: null },
  selected: { type: Boolean, default: false },
  compareSelected: { type: Boolean, default: false },
  showCompare: { type: Boolean, default: true },
  scaleSeconds: { type: Number, default: 0 },
  balancedPick: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'toggle-compare', 'vote'])

const h = useHangoutStore()
const s = computed(() => summaryOf(props.venue))
const price = computed(() => priceLevel(props.venue.price_level))
const activity = computed(() => h.catalogue.find((a) => a.id === props.venue.activity_id) ?? h.activities.find((a) => a.id === props.venue.activity_id))
const routes = computed(() => h.routesByVenue.get(props.venue.id) ?? [])
const votes = computed(() => h.voteCounts.get(props.venue.id) ?? 0)
const myVote = computed(() => h.myVenueVote === props.venue.id)
const canVote = computed(() => ['venue_discovery', 'voting'].includes(h.hangout.status))
const maxTravelSeconds = computed(() => (h.hangout.max_travel_minutes ? h.hangout.max_travel_minutes * 60 : null))
</script>

<template>
  <article
    class="overflow-hidden rounded-3xl border bg-surface shadow-soft transition-[border-color,box-shadow] duration-150"
    :class="selected ? 'border-mint-500 ring-2 ring-mint-400/50' : 'border-line hover:border-line-strong'"
    @click="emit('select', venue.id)"
  >
    <div class="grid sm:grid-cols-[11rem_minmax(0,1fr)]">
      <VenuePhoto :venue="venue" :icon="activity?.icon" aspect="aspect-[16/9] sm:aspect-auto sm:h-full">
        <span v-if="rank" class="absolute top-2.5 left-2.5 flex h-8 min-w-8 items-center justify-center rounded-full bg-surface px-2 font-display text-sm font-extrabold text-ink shadow-soft">#{{ rank }}</span>
      </VenuePhoto>
      <div class="min-w-0 p-4">
        <div class="flex flex-wrap items-center gap-1.5">
          <span v-if="rank === 1" class="flex items-center gap-1 rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-bold text-mint-300 dark:bg-mint-400 dark:text-navy-900"><Crown :size="12" aria-hidden="true" />Meetzy pick</span>
          <span v-if="balancedPick" class="flex items-center gap-1 rounded-full bg-lavender-100 px-2 py-0.5 text-[11px] font-bold text-lavender-700 dark:bg-lavender-700/30 dark:text-lavender-200"><Scale :size="12" aria-hidden="true" />Most balanced</span>
          <span v-if="!s.complete" class="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn">Route missing for {{ s.participants - s.reachable }}</span>
          <span v-else-if="s.withinLimit === false" class="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Over time limit</span>
        </div>
        <h3 class="mt-1.5 truncate font-display text-lg font-bold">{{ venue.name ?? 'Venue details expired' }}</h3>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-soft">
          <span v-if="venue.rating != null" class="flex items-center gap-1 font-semibold text-ink">
            <Star :size="14" class="fill-sun-400 text-sun-400" aria-hidden="true" />{{ Number(venue.rating).toFixed(1) }}
            <span class="font-normal text-muted">({{ venue.rating_count?.toLocaleString() ?? 0 }})</span>
          </span>
          <span v-if="price" :title="price.label">· {{ price.symbols }}</span>
          <span v-if="venue.primary_type_label || activity">· {{ venue.primary_type_label || activity.name }}</span>
          <span v-if="venue.open_now != null" :class="venue.open_now ? 'text-accent-ink' : 'text-danger'">· {{ venue.open_now ? 'Open now' : 'Closed now' }}</span>
        </p>
        <p v-if="venue.address" class="mt-1 flex items-start gap-1 truncate text-xs text-muted"><MapPin :size="13" class="mt-px shrink-0" aria-hidden="true" /><span class="truncate">{{ venue.address }}</span></p>

        <div class="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div class="rounded-xl bg-surface-2 px-2 py-1.5"><p class="text-[11px] text-muted">Average</p><p class="text-sm font-bold tabular-nums">{{ duration(s.avg) }}</p></div>
          <div class="rounded-xl bg-surface-2 px-2 py-1.5"><p class="text-[11px] text-muted">Longest</p><p class="text-sm font-bold tabular-nums">{{ duration(s.max) }}</p></div>
          <div class="rounded-xl bg-surface-2 px-2 py-1.5"><p class="text-[11px] text-muted">From area</p><p class="text-sm font-bold tabular-nums">{{ distance(venue.distance_from_area_m) }}</p></div>
        </div>
        <div class="mt-3">
          <MemberTravelTimes :people="h.participants" :routes="routes" :scale-seconds="scaleSeconds" :max-travel-seconds="maxTravelSeconds" />
        </div>
        <p v-if="venue.explanation" class="mt-3 text-sm text-ink-soft">{{ venue.explanation }}</p>

        <div class="mt-4 flex flex-wrap items-center gap-2" @click.stop>
          <button
            v-if="canVote"
            type="button"
            :aria-pressed="myVote"
            class="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors"
            :class="myVote ? 'bg-accent text-on-accent' : 'border border-line-strong text-ink hover:bg-surface-2'"
            @click="emit('vote', venue.id)"
          >
            <component :is="myVote ? Check : Vote" :size="16" aria-hidden="true" /> {{ myVote ? 'Your vote' : 'Vote' }}
            <span v-if="votes" class="rounded-full bg-navy-900/10 px-1.5 text-xs tabular-nums dark:bg-white/10">{{ votes }}</span>
          </button>
          <label v-if="showCompare" class="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft hover:bg-surface-2">
            <input type="checkbox" class="h-4 w-4 accent-mint-600" :checked="compareSelected" @change="emit('toggle-compare', venue.id)" /> Compare
          </label>
          <a
            v-if="venue.google_maps_uri"
            :href="venue.google_maps_uri"
            target="_blank"
            rel="noopener noreferrer"
            class="ml-auto flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft"
          >
            Google Maps <ExternalLink :size="14" aria-hidden="true" />
          </a>
        </div>
        <details v-if="Array.isArray(venue.opening_hours) && venue.opening_hours.length" class="mt-2 text-xs text-muted" @click.stop>
          <summary class="flex cursor-pointer items-center gap-1 font-semibold"><Clock :size="13" aria-hidden="true" /> Opening hours</summary>
          <ul class="mt-1.5 space-y-0.5 pl-4">
            <li v-for="line in venue.opening_hours" :key="line">{{ line }}</li>
          </ul>
        </details>
      </div>
    </div>
  </article>
</template>
