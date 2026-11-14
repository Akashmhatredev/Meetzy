<script setup>
import { computed, onMounted } from 'vue'
import { Navigation, CalendarPlus, Share2, Star, MapPin, CalendarClock, RefreshCw, PartyPopper, Hourglass } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import GroupMap from '@/components/maps/GroupMap.vue'
import VenuePhoto from '@/components/venues/VenuePhoto.vue'
import MemberTravelTimes from '@/components/venues/MemberTravelTimes.vue'
import GoogleAttribution from '@/components/venues/GoogleAttribution.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { useVenueRoutes } from '@/composables/useVenueRoutes'
import { summaryOf } from '@/services/midpoint'
import { directionsUrl, travelMode } from '@/utils/domain'
import { dateTime, duration, priceLevel } from '@/utils/format'
import { hangoutIcs, downloadText } from '@/utils/calendar'
import { appOrigin } from '@/services/config'

const h = useHangoutStore()
const ui = useUiStore()
const venue = computed(() => h.selectedVenue)
const { selectedRoutes, loadingRoutes, load } = useVenueRoutes(null, { auto: false })
const routes = computed(() => (venue.value ? h.routesByVenue.get(venue.value.id) ?? [] : []))
const s = computed(() => summaryOf(venue.value))
const expired = computed(() => venue.value && !venue.value.name)

onMounted(() => {
  if (venue.value) load(venue.value.id, { refresh: expired.value })
})

const myDirections = computed(() =>
  venue.value ? directionsUrl({ venue: venue.value, origin: h.myLocation, travelMode: h.hangout.travel_mode }) : '#',
)
const shareText = computed(() => `${h.hangout.title}: we're meeting at ${venue.value?.name}${h.hangout.scheduled_for ? ` on ${dateTime(h.hangout.scheduled_for)}` : ''}. ${appOrigin()}/hangouts/${h.hangoutId}/confirmed`)

async function share() {
  try {
    if (navigator.share) await navigator.share({ title: h.hangout.title, text: shareText.value })
    else {
      await navigator.clipboard.writeText(shareText.value)
      ui.success('Plan copied. Paste it anywhere.')
    }
  } catch {
    // dismissed
  }
}

function addToCalendar() {
  downloadText(
    `${h.hangout.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'hangout'}.ics`,
    hangoutIcs({
      id: h.hangoutId,
      title: h.hangout.title,
      start: h.hangout.scheduled_for,
      location: [venue.value?.name, venue.value?.address].filter(Boolean).join(', '),
      url: `${appOrigin()}/hangouts/${h.hangoutId}/confirmed`,
      description: h.hangout.notes ?? '',
    }),
  )
}
</script>

<template>
  <div>
    <div v-if="h.hangout.status !== 'finalized' || !venue" class="card">
      <EmptyState :icon="Hourglass" title="Not finalised yet" description="Once the group votes and an organiser finalises a venue, the plan and directions appear here." compact>
        <BaseButton :to="{ name: 'hangout-vote', params: { hangoutId: h.hangoutId } }">Go to the vote</BaseButton>
      </EmptyState>
    </div>
    <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section class="space-y-5">
        <article class="card overflow-hidden">
          <VenuePhoto :venue="venue" aspect="aspect-[16/8]">
            <span class="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-mint-400 px-3 py-1 text-xs font-bold text-navy-900 shadow-soft">
              <PartyPopper :size="14" aria-hidden="true" /> It's set!
            </span>
          </VenuePhoto>
          <div class="card-pad">
            <template v-if="expired">
              <p class="font-display text-xl font-bold">Venue details expired</p>
              <p class="mt-1 text-sm text-ink-soft">Google content is cached for 30 days at most. Refresh to fetch the latest details.</p>
              <BaseButton class="mt-3" size="sm" variant="secondary" :icon="RefreshCw" :loading="loadingRoutes" @click="load(venue.id, { refresh: true })">Refresh from Google</BaseButton>
            </template>
            <template v-else>
              <h2 class="font-display text-2xl font-extrabold">{{ venue.name }}</h2>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
                <span v-if="venue.rating != null" class="flex items-center gap-1 font-semibold text-ink"><Star :size="14" class="fill-sun-400 text-sun-400" aria-hidden="true" />{{ Number(venue.rating).toFixed(1) }}</span>
                <span v-if="priceLevel(venue.price_level)">· {{ priceLevel(venue.price_level).symbols }}</span>
                <span v-if="venue.primary_type_label">· {{ venue.primary_type_label }}</span>
              </p>
              <p v-if="venue.address" class="mt-2 flex items-start gap-1.5 text-sm"><MapPin :size="16" class="mt-px shrink-0 text-accent-ink" aria-hidden="true" />{{ venue.address }}</p>
            </template>
            <p v-if="h.hangout.scheduled_for" class="mt-2 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock :size="16" class="text-accent-ink" aria-hidden="true" />{{ dateTime(h.hangout.scheduled_for) }}</p>

            <BaseButton class="mt-5" block size="lg" :href="myDirections" target="_blank" rel="noopener noreferrer" :icon="Navigation">Open in Google Maps</BaseButton>
            <p class="mt-2 text-center text-xs text-muted">
              {{ h.myLocation ? `Directions from your shared location by ${travelMode(h.hangout.travel_mode).label.toLowerCase()}.` : 'Directions from wherever you are now.' }}
            </p>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <BaseButton variant="secondary" :icon="Share2" @click="share">Share plan</BaseButton>
              <BaseButton v-if="h.hangout.scheduled_for" variant="secondary" :icon="CalendarPlus" @click="addToCalendar">Add to calendar</BaseButton>
              <BaseButton v-else variant="secondary" :to="{ name: 'hangout-vote', params: { hangoutId: h.hangoutId } }">See votes</BaseButton>
            </div>
          </div>
        </article>

        <section class="card card-pad">
          <div class="mb-3 flex items-baseline justify-between gap-3">
            <h3 class="font-bold">Everyone's trip</h3>
            <span class="text-sm text-muted">longest {{ duration(s.max) }} · avg {{ duration(s.avg) }}</span>
          </div>
          <MemberTravelTimes :people="h.people.filter((p) => routes.some((r) => r.user_id === p.userId) || p.location)" :routes="routes" />
          <p v-if="venue.explanation" class="mt-4 text-sm text-ink-soft">{{ venue.explanation }}</p>
        </section>
      </section>

      <section class="space-y-3">
        <GroupMap
          :people="h.people"
          :venues="[venue]"
          :final-venue-id="venue.id"
          :selected-venue-id="venue.id"
          :routes="selectedRoutes.length ? selectedRoutes : routes"
          height="min(75dvh, 40rem)"
          label="Routes to the venue"
        />
        <p v-if="loadingRoutes" class="text-xs text-muted">Drawing everyone's route…</p>
        <GoogleAttribution />
      </section>
    </div>
  </div>
</template>
