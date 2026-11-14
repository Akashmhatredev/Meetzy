<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MapPin,
  Shapes,
  Sparkles,
  Store,
  Vote,
  PartyPopper,
  Check,
  ChevronRight,
  Pencil,
  Ban,
  RotateCcw,
  Trash2,
  Map as MapIcon,
  StickyNote,
  Scale,
} from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import DropdownMenu from '@/components/common/DropdownMenu.vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import ActivityIcon from '@/components/activities/ActivityIcon.vue'
import HangoutSettingsDialog from '@/components/hangouts/HangoutSettingsDialog.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useGroupsStore } from '@/stores/groups'
import { useUiStore } from '@/stores/ui'
import { STRATEGIES } from '@/services/midpoint'
import { travelMode, HANGOUT_STEPS } from '@/utils/domain'
import { duration } from '@/utils/format'
import { errorMessage } from '@/utils/errors'

const h = useHangoutStore()
const groups = useGroupsStore()
const ui = useUiStore()
const router = useRouter()
const settingsOpen = ref(false)

const ICONS = { locations: MapPin, activities: Shapes, meeting: Sparkles, venues: Store, vote: Vote, final: PartyPopper }
const steps = computed(() => HANGOUT_STEPS.map((s) => ({ ...s, ...h.steps[s.key], icon: ICONS[s.key] })))
const nextStep = computed(() => steps.value.find((s) => !s.done) ?? steps.value.at(-1))
const topVenues = computed(() => h.rankedVenues.slice(0, 3))

const PHASE_ACTIONS = {
  waiting_for_locations: { label: 'Move on to activities', status: 'activity_selection' },
}

async function setStatus(status, message) {
  try {
    await h.setStatus(status)
    if (message) ui.success(message)
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

async function cancel() {
  const ok = await ui.confirm({ title: 'Cancel this hangout?', message: 'Members are notified. You can restore it later.', confirmLabel: 'Cancel hangout', danger: true })
  if (ok) setStatus('cancelled', 'Hangout cancelled.')
}
async function remove() {
  const ok = await ui.confirm({
    title: 'Delete this hangout?',
    message: 'All location shares, votes and venues for it are deleted for everyone. This cannot be undone.',
    confirmLabel: 'Delete hangout',
    danger: true,
  })
  if (!ok) return
  try {
    const groupId = h.hangout.group_id
    await h.remove()
    groups.load({ silent: true })
    ui.success('Hangout deleted.')
    router.replace(`/groups/${groupId}`)
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

const menu = computed(() => [
  ...(h.isOpen ? [{ label: 'Edit details', icon: Pencil, onSelect: () => (settingsOpen.value = true) }] : []),
  { label: 'Group map', icon: MapIcon, to: { name: 'hangout-map', params: { hangoutId: h.hangoutId } } },
  ...(h.isOpen ? [{ label: 'Cancel hangout', icon: Ban, danger: true, onSelect: cancel }] : []),
  ...(h.hangout.status === 'cancelled' ? [{ label: 'Restore hangout', icon: RotateCcw, onSelect: () => setStatus('waiting_for_locations', 'Hangout restored.') }] : []),
  { label: 'Delete hangout', icon: Trash2, danger: true, onSelect: remove },
])
</script>

<template>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
    <section class="space-y-5">
      <div v-if="h.hangout.status === 'cancelled'" class="card card-pad border-rose-300 bg-rose-100/40 dark:bg-rose-700/10">
        <p class="font-bold">This hangout was cancelled.</p>
        <p class="text-sm text-ink-soft">{{ h.canManage ? 'Restore it from the menu to keep planning.' : 'An organiser can restore it.' }}</p>
      </div>

      <div v-if="h.isOpen && nextStep" class="card card-pad flex flex-col gap-4 bg-navy-900 text-white sm:flex-row sm:items-center dark:bg-navy-950">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint-400 text-navy-900"><component :is="nextStep.icon" :size="24" aria-hidden="true" /></div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold tracking-wide text-mint-300 uppercase">Next step</p>
          <p class="font-display text-lg font-bold text-white">{{ nextStep.label }}</p>
          <p class="text-sm text-navy-300">{{ nextStep.detail }}</p>
        </div>
        <BaseButton :to="{ name: nextStep.route, params: { hangoutId: h.hangoutId } }">Continue</BaseButton>
      </div>
      <div v-else-if="h.hangout.status === 'finalized'" class="card card-pad flex flex-col gap-4 sm:flex-row sm:items-center">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint-400 text-navy-900"><PartyPopper :size="24" aria-hidden="true" /></div>
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-bold">Meeting at {{ h.selectedVenue?.name }}</p>
          <p class="text-sm text-ink-soft">Everyone gets directions from where they shared.</p>
        </div>
        <BaseButton :to="{ name: 'hangout-confirmed', params: { hangoutId: h.hangoutId } }">See plan</BaseButton>
      </div>

      <ol class="card divide-y divide-line overflow-hidden">
        <li v-for="s in steps" :key="s.key">
          <RouterLink :to="{ name: s.route, params: { hangoutId: h.hangoutId } }" class="flex items-center gap-3 p-4 transition-colors hover:bg-surface-2">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" :class="s.done ? 'bg-mint-400 text-navy-900' : 'bg-surface-2 text-ink-soft'">
              <Check v-if="s.done" :size="18" stroke-width="3" aria-hidden="true" />
              <component :is="s.icon" v-else :size="18" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ s.label }}</span>
              <span class="block truncate text-sm text-muted">{{ s.detail }}</span>
            </span>
            <ChevronRight :size="18" class="text-muted" aria-hidden="true" />
          </RouterLink>
        </li>
      </ol>

      <section v-if="topVenues.length" class="card card-pad">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-bold">Top venues</h3>
          <RouterLink :to="{ name: 'hangout-venues', params: { hangoutId: h.hangoutId } }" class="link text-sm">All venues</RouterLink>
        </div>
        <ul class="space-y-2">
          <li v-for="v in topVenues" :key="v.id" class="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface font-display text-sm font-extrabold">{{ v.rank }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold">{{ v.name }}</span>
              <span class="block text-xs text-muted">longest trip {{ duration(v.max_travel_seconds) }} · avg {{ duration(v.avg_travel_seconds) }}</span>
            </span>
            <span class="text-sm font-semibold text-ink-soft tabular-nums">{{ h.voteCounts.get(v.id) ?? 0 }} <Vote :size="14" class="inline" aria-label="votes" /></span>
          </li>
        </ul>
      </section>
    </section>

    <aside class="space-y-5">
      <section class="card card-pad">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-bold">Plan details</h3>
          <DropdownMenu v-if="h.canManage" :items="menu" label="Hangout actions" />
          <BaseButton v-else size="sm" variant="ghost" :icon="MapIcon" :to="{ name: 'hangout-map', params: { hangoutId: h.hangoutId } }">Map</BaseButton>
        </div>
        <dl class="mt-3 space-y-3 text-sm">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-soft">Travel</dt>
            <dd class="flex items-center gap-1.5 font-semibold"><component :is="travelMode(h.hangout.travel_mode).icon" :size="16" aria-hidden="true" />{{ travelMode(h.hangout.travel_mode).label }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-soft">Strategy</dt>
            <dd class="flex items-center gap-1.5 font-semibold"><Scale :size="16" aria-hidden="true" />{{ STRATEGIES[h.hangout.optimization_strategy].label }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-soft">Longest acceptable trip</dt>
            <dd class="font-semibold">{{ h.hangout.max_travel_minutes ? `${h.hangout.max_travel_minutes} min` : 'No limit' }}</dd>
          </div>
        </dl>
        <p v-if="h.hangout.notes" class="mt-4 flex gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-ink-soft"><StickyNote :size="16" class="mt-px shrink-0" aria-hidden="true" />{{ h.hangout.notes }}</p>
        <BaseButton v-if="h.canManage && PHASE_ACTIONS[h.hangout.status]" class="mt-4" block variant="secondary" @click="setStatus(PHASE_ACTIONS[h.hangout.status].status)">
          {{ PHASE_ACTIONS[h.hangout.status].label }}
        </BaseButton>
      </section>

      <section class="card card-pad">
        <div class="flex items-center justify-between">
          <h3 class="font-bold">Locations</h3>
          <span class="text-sm text-muted tabular-nums">{{ h.participants.length }}/{{ h.people.length }}</span>
        </div>
        <AvatarStack class="mt-3" :people="h.people" :max="8" :size="32" />
        <p class="mt-2 text-sm text-ink-soft">
          <template v-if="h.waitingOn.length">Waiting on {{ h.waitingOn.map((p) => (p.isYou ? 'you' : p.name.split(' ')[0])).join(', ') }}.</template>
          <template v-else>Everyone has shared a location.</template>
        </p>
      </section>

      <section class="card card-pad">
        <div class="flex items-center justify-between">
          <h3 class="font-bold">Activities</h3>
          <span class="text-sm text-muted">{{ h.activityVoterCount }} voted</span>
        </div>
        <ul v-if="h.activities.length" class="mt-3 flex flex-wrap gap-1.5">
          <li v-for="a in h.activities.slice(0, 8)" :key="a.id" class="chip">
            <ActivityIcon :name="a.icon" :size="14" /> {{ a.name }} <span class="text-muted tabular-nums">{{ a.votes }}</span>
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-muted">Nothing picked yet.</p>
      </section>
    </aside>
    <HangoutSettingsDialog v-model:open="settingsOpen" />
  </div>
</template>
