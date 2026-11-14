<script setup>
/**
 * One bar per friend: their real travel time to this venue. A missing
 * route is shown as missing, never estimated.
 */
import { computed } from 'vue'
import { duration, distance } from '@/utils/format'

const props = defineProps({
  people: { type: Array, required: true }, // participants (with color)
  routes: { type: Array, default: () => [] }, // venue_routes rows for one venue
  scaleSeconds: { type: Number, default: 0 }, // shared scale across venues
  compact: { type: Boolean, default: false },
  maxTravelSeconds: { type: Number, default: null },
})

const rows = computed(() =>
  props.people.map((p) => {
    const r = props.routes.find((x) => x.user_id === p.userId)
    return { person: p, seconds: r?.travel_time_seconds ?? null, meters: r?.distance_meters ?? null, known: !!r }
  }),
)
const scale = computed(() => props.scaleSeconds || Math.max(1, ...rows.value.map((r) => r.seconds ?? 0)))
</script>

<template>
  <ul class="space-y-1.5" :aria-label="'Travel time per friend'">
    <li v-for="r in rows" :key="r.person.userId" class="flex items-center gap-2 text-xs sm:text-sm">
      <span class="w-16 shrink-0 truncate font-semibold sm:w-20" :title="r.person.name">{{ r.person.isYou ? 'You' : r.person.name.split(' ')[0] }}</span>
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div
          v-if="r.seconds != null"
          class="h-full rounded-full"
          :style="{ width: `${Math.max(6, (r.seconds / scale) * 100)}%`, background: r.person.color }"
        />
      </div>
      <span
        class="w-16 shrink-0 text-right font-semibold tabular-nums sm:w-20"
        :class="r.seconds == null ? 'text-warn' : maxTravelSeconds && r.seconds > maxTravelSeconds ? 'text-danger' : 'text-ink-soft'"
        :title="r.meters != null ? distance(r.meters) : undefined"
      >
        {{ r.seconds != null ? duration(r.seconds) : r.known ? 'No route' : r.person.location ? 'Recalculate' : 'Not shared' }}
      </span>
    </li>
  </ul>
</template>
