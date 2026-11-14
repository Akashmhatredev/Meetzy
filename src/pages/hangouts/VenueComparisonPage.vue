<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Star, Crown, Scale, Check, Vote, Columns3 } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import VenuePhoto from '@/components/venues/VenuePhoto.vue'
import GoogleAttribution from '@/components/venues/GoogleAttribution.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { summaryOf, bestBalancedId, STRATEGIES } from '@/services/midpoint'
import { duration, priceLevel } from '@/utils/format'
import { errorMessage } from '@/utils/errors'

const route = useRoute()
const h = useHangoutStore()
const ui = useUiStore()

const venues = computed(() => {
  const ids = String(route.query.ids ?? '')
    .split(',')
    .filter(Boolean)
  const picked = ids.length ? h.rankedVenues.filter((v) => ids.includes(v.id)) : []
  return (picked.length >= 2 ? picked : h.rankedVenues).slice(0, 5)
})
const balanced = computed(() => bestBalancedId(venues.value))
const meetzyPick = computed(() => h.rankedVenues[0]?.id)
const routeFor = (venueId, userId) => h.routesByVenue.get(venueId)?.find((r) => r.user_id === userId) ?? null
const canVote = computed(() => ['venue_discovery', 'voting'].includes(h.hangout.status))
const maxTravel = computed(() => (h.hangout.max_travel_minutes ? h.hangout.max_travel_minutes * 60 : null))

// Per row (friend), which venue gives them the shortest trip.
const fastestFor = (userId) => {
  let best = null
  for (const v of venues.value) {
    const t = routeFor(v.id, userId)?.travel_time_seconds
    if (t != null && (best == null || t < best.t)) best = { id: v.id, t }
  }
  return best?.id
}
const bestMetric = (key) => {
  const values = venues.value.map((v) => summaryOf(v)[key]).filter((x) => x != null)
  return values.length ? Math.min(...values) : null
}
const activityName = (v) => (h.catalogue.find((a) => a.id === v.activity_id) ?? h.activities.find((a) => a.id === v.activity_id))?.name

async function vote(id) {
  try {
    await h.vote(id)
    ui.success('Vote saved. You can change it until voting closes.')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}
</script>

<template>
  <div>
    <div class="mb-5">
      <h2 class="text-xl font-bold">Compare venues</h2>
      <p class="text-ink-soft">
        Every friend's real travel time, side by side. Ranked with the <strong>{{ STRATEGIES[h.hangout.optimization_strategy].label }}</strong> strategy, and you can still vote for any venue.
      </p>
    </div>

    <div v-if="venues.length < 2" class="card">
      <EmptyState :icon="Columns3" title="Not enough venues to compare" description="Calculate the meeting point to get a ranked list of venues." compact>
        <BaseButton :to="{ name: 'hangout-meeting-point', params: { hangoutId: h.hangoutId } }">Find the meeting point</BaseButton>
      </EmptyState>
    </div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full min-w-[40rem] border-collapse text-sm">
        <caption class="sr-only">Travel time per friend for each venue</caption>
        <thead>
          <tr>
            <th scope="col" class="sticky left-0 z-10 w-40 bg-surface p-3 text-left align-bottom text-xs font-semibold text-muted">Venue</th>
            <th v-for="v in venues" :key="v.id" scope="col" class="min-w-40 p-3 text-left align-top font-normal" :class="v.id === balanced && 'bg-lavender-100/50 dark:bg-lavender-700/15'">
              <VenuePhoto :venue="v" aspect="aspect-[16/9]" class="mb-2.5 rounded-xl" />
              <div class="mb-1 flex flex-wrap gap-1">
                <span v-if="v.id === meetzyPick" class="flex items-center gap-1 rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-bold text-mint-300 dark:bg-mint-400 dark:text-navy-900"><Crown :size="11" aria-hidden="true" />Meetzy pick</span>
                <span v-if="v.id === balanced" class="flex items-center gap-1 rounded-full bg-lavender-100 px-2 py-0.5 text-[10px] font-bold text-lavender-700 dark:bg-lavender-700/30 dark:text-lavender-200"><Scale :size="11" aria-hidden="true" />Most balanced</span>
              </div>
              <p class="font-display font-bold">#{{ v.rank }} {{ v.name }}</p>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="p in h.participants" :key="p.userId">
            <th scope="row" class="sticky left-0 z-10 bg-surface p-3 text-left font-semibold">
              <span class="flex items-center gap-2">
                <UserAvatar :name="p.name" :src="p.avatarUrl" :size="26" :color="p.color" />
                <span class="truncate">{{ p.isYou ? 'You' : p.name.split(' ')[0] }}</span>
              </span>
            </th>
            <td v-for="v in venues" :key="v.id" class="p-3 tabular-nums" :class="v.id === balanced && 'bg-lavender-100/50 dark:bg-lavender-700/15'">
              <template v-if="routeFor(v.id, p.userId)?.travel_time_seconds != null">
                <span class="font-semibold" :class="maxTravel && routeFor(v.id, p.userId).travel_time_seconds > maxTravel ? 'text-danger' : ''">{{ duration(routeFor(v.id, p.userId).travel_time_seconds) }}</span>
                <span v-if="fastestFor(p.userId) === v.id" class="ml-1 text-xs text-accent-ink">fastest</span>
              </template>
              <span v-else class="text-warn">{{ routeFor(v.id, p.userId) ? 'No route' : 'Not calculated' }}</span>
            </td>
          </tr>
          <tr class="bg-surface-2/60">
            <th scope="row" class="sticky left-0 z-10 bg-surface-2 p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Average</th>
            <td v-for="v in venues" :key="v.id" class="p-3 font-bold tabular-nums" :class="summaryOf(v).avg === bestMetric('avg') && 'text-accent-ink'">{{ duration(summaryOf(v).avg) }}</td>
          </tr>
          <tr class="bg-surface-2/60">
            <th scope="row" class="sticky left-0 z-10 bg-surface-2 p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Longest trip</th>
            <td v-for="v in venues" :key="v.id" class="p-3 font-bold tabular-nums" :class="summaryOf(v).max === bestMetric('max') && 'text-accent-ink'">{{ duration(summaryOf(v).max) }}</td>
          </tr>
          <tr class="bg-surface-2/60">
            <th scope="row" class="sticky left-0 z-10 bg-surface-2 p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Total</th>
            <td v-for="v in venues" :key="v.id" class="p-3 font-bold tabular-nums" :class="summaryOf(v).total === bestMetric('total') && 'text-accent-ink'">{{ duration(summaryOf(v).total) }}</td>
          </tr>
          <tr>
            <th scope="row" class="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Gap between trips</th>
            <td v-for="v in venues" :key="v.id" class="p-3 tabular-nums">{{ duration(summaryOf(v).spread) }}</td>
          </tr>
          <tr>
            <th scope="row" class="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Rating</th>
            <td v-for="v in venues" :key="v.id" class="p-3">
              <span v-if="v.rating != null" class="flex items-center gap-1 font-semibold"><Star :size="14" class="fill-sun-400 text-sun-400" aria-hidden="true" />{{ Number(v.rating).toFixed(1) }} <span class="font-normal text-muted">({{ v.rating_count?.toLocaleString() }})</span></span>
              <span v-else class="text-muted">No rating</span>
            </td>
          </tr>
          <tr>
            <th scope="row" class="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Price</th>
            <td v-for="v in venues" :key="v.id" class="p-3">{{ priceLevel(v.price_level)?.symbols ?? '—' }}</td>
          </tr>
          <tr>
            <th scope="row" class="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Category</th>
            <td v-for="v in venues" :key="v.id" class="p-3">{{ v.primary_type_label || activityName(v) || '—' }}</td>
          </tr>
          <tr v-if="canVote">
            <th scope="row" class="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-bold uppercase tracking-wide text-muted">Your vote</th>
            <td v-for="v in venues" :key="v.id" class="p-3">
              <BaseButton size="sm" :variant="h.myVenueVote === v.id ? 'primary' : 'secondary'" :icon="h.myVenueVote === v.id ? Check : Vote" @click="vote(v.id)">
                {{ h.myVenueVote === v.id ? 'Voted' : 'Vote' }}
              </BaseButton>
              <p class="mt-1 text-xs text-muted">{{ h.voteCounts.get(v.id) ?? 0 }} vote(s)</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="venues.length >= 2" class="mt-3 text-sm text-ink-soft">
      <strong>Most balanced</strong> is the venue where trips are closest to each other in length. <strong>Meetzy pick</strong> is the top venue for your strategy.
    </p>
    <GoogleAttribution class="mt-3" />
  </div>
</template>
