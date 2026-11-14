<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Check } from 'lucide-vue-next'
import { HANGOUT_STEPS } from '@/utils/domain'
import { useHangoutStore } from '@/stores/hangout'

const route = useRoute()
const h = useHangoutStore()

const ROUTE_STEP = {
  'hangout-location': 'locations',
  'hangout-map': 'locations',
  'hangout-activities': 'activities',
  'hangout-activity-vote': 'activities',
  'hangout-meeting-point': 'meeting',
  'hangout-venues': 'venues',
  'hangout-compare': 'venues',
  'hangout-vote': 'vote',
  'hangout-confirmed': 'final',
}
const current = computed(() => ROUTE_STEP[route.name] ?? null)
const items = computed(() =>
  HANGOUT_STEPS.map((s, i) => ({ ...s, index: i + 1, done: h.steps[s.key]?.done, active: current.value === s.key })),
)
</script>

<template>
  <nav aria-label="Planning steps">
    <ol class="grid grid-cols-6 gap-1.5">
      <li v-for="s in items" :key="s.key" class="min-w-0">
        <RouterLink
          :to="{ name: s.route, params: { hangoutId: h.hangoutId } }"
          class="group flex flex-col gap-1.5 rounded-xl py-1 outline-offset-4"
          :aria-current="s.active ? 'step' : undefined"
        >
          <span
            class="h-1.5 rounded-full transition-colors"
            :class="s.active ? 'bg-ink' : s.done ? 'bg-mint-400' : 'bg-line group-hover:bg-line-strong'"
          />
          <span
            class="flex items-center gap-1 truncate text-[11px] font-semibold sm:text-xs"
            :class="s.active ? 'text-ink' : s.done ? 'text-accent-ink' : 'text-muted group-hover:text-ink-soft'"
          >
            <Check v-if="s.done && !s.active" :size="12" stroke-width="3" class="hidden shrink-0 sm:block" aria-hidden="true" />
            <span class="truncate" :class="!s.active && 'hidden sm:inline'">{{ s.label }}</span>
            <span v-if="!s.active" class="sm:hidden">{{ s.index }}</span>
          </span>
          <span v-if="s.done" class="sr-only">(done)</span>
        </RouterLink>
      </li>
    </ol>
  </nav>
</template>
