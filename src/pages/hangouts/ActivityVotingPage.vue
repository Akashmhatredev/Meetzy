<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ThumbsUp, Trash2, Flame, ArrowRight, Plus, Shapes } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import ActivityIcon from '@/components/activities/ActivityIcon.vue'
import NextStepBar from '@/components/hangouts/NextStepBar.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { plural } from '@/utils/format'

const h = useHangoutStore()
const ui = useUiStore()
const router = useRouter()
const busy = ref(null)

const people = (ids) => ids.map((id) => h.personById.get(id)).filter(Boolean)
const notVoted = computed(() => h.people.filter((p) => !h.activityVotes.some((v) => v.user_id === p.userId)))
const usedForSearch = computed(() =>
  h.hangout.activity_mode === 'most_popular' ? h.activities.filter((a) => a.votes === h.topVotes && a.votes > 0) : h.activities,
)

async function toggle(a) {
  busy.value = a.id
  try {
    await h.toggleActivity(a.id, !a.myVote)
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = null
  }
}

async function remove(a) {
  const ok = await ui.confirm({ title: `Remove ${a.name}?`, message: 'Its votes are removed too.', confirmLabel: 'Remove', danger: true })
  if (!ok) return
  try {
    await h.removeActivity(a.id)
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

const mode = computed({
  get: () => h.hangout.activity_mode,
  set: async (value) => {
    try {
      await h.updateSettings({ activity_mode: value })
    } catch (e) {
      ui.error(errorMessage(e))
    }
  },
})
</script>

<template>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <section>
      <div class="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold">Activity vote</h2>
          <p class="text-ink-soft">{{ plural(h.activityVoterCount, 'person', 'people') }} of {{ h.people.length }} voted. Updates live.</p>
        </div>
        <BaseButton v-if="h.isOpen" size="sm" variant="secondary" :icon="Plus" :to="{ name: 'hangout-activities', params: { hangoutId: h.hangoutId } }">Add</BaseButton>
      </div>

      <div v-if="!h.activities.length" class="card">
        <EmptyState :icon="Shapes" title="Nothing on the shortlist" description="Pick a few activities and your friends can vote on them." compact>
          <BaseButton :to="{ name: 'hangout-activities', params: { hangoutId: h.hangoutId } }">Pick activities</BaseButton>
        </EmptyState>
      </div>
      <TransitionGroup v-else tag="ol" name="list" class="space-y-2.5">
        <li v-for="(a, i) in h.activities" :key="a.id" class="card flex items-center gap-3 p-3.5 sm:p-4">
          <span class="w-5 text-center font-display text-sm font-extrabold text-muted tabular-nums">{{ i + 1 }}</span>
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-accent-ink"><ActivityIcon :name="a.icon" :size="21" /></span>
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-display font-bold">
              <span class="min-w-0 break-words">{{ a.name }}</span>
              <span v-if="a.votes === h.topVotes && a.votes > 0" class="flex shrink-0 items-center gap-0.5 rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-bold text-sun-700 dark:bg-sun-700/30 dark:text-sun-200">
                <Flame :size="12" aria-hidden="true" /> Popular
              </span>
            </p>
            <div class="mt-1.5 flex items-center gap-2">
              <div class="h-2 max-w-40 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div class="h-full rounded-full bg-mint-400 transition-[width] duration-500" :style="{ width: `${(a.votes / Math.max(1, h.people.length)) * 100}%` }" />
              </div>
              <span class="text-xs font-semibold text-ink-soft tabular-nums">{{ a.votes }}</span>
              <AvatarStack :people="people(a.voters)" :size="22" :max="4" class="hidden sm:flex" />
            </div>
          </div>
          <button
            v-if="h.isOpen"
            type="button"
            :aria-pressed="a.myVote"
            :disabled="busy === a.id"
            class="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors"
            :class="a.myVote ? 'bg-accent text-on-accent' : 'border border-line-strong text-ink-soft hover:text-ink'"
            @click="toggle(a)"
          >
            <ThumbsUp :size="16" aria-hidden="true" /> {{ a.myVote ? 'Voted' : 'Vote' }}
          </button>
          <button v-if="h.canManage && h.isOpen" type="button" class="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger" :aria-label="`Remove ${a.name}`" @click="remove(a)">
            <Trash2 :size="16" aria-hidden="true" />
          </button>
        </li>
      </TransitionGroup>
    </section>

    <aside class="space-y-5">
      <section class="card card-pad">
        <h3 class="font-bold">Venue search uses</h3>
        <SegmentedControl v-if="h.canManage && h.isOpen" v-model="mode" class="mt-3" size="sm" label="Activities used for venue search" :options="[{ value: 'all_selected', label: 'All picked' }, { value: 'most_popular', label: 'Most popular' }]" />
        <p class="mt-3 text-sm text-ink-soft">
          <template v-if="usedForSearch.length">{{ usedForSearch.map((a) => a.name).join(', ') }}</template>
          <template v-else>Nothing yet.</template>
        </p>
        <p class="mt-2 text-xs text-muted">
          {{ h.hangout.activity_mode === 'most_popular' ? 'Only the top-voted activities (ties included).' : 'Every shortlisted activity, up to the five with the most votes.' }}
          <template v-if="!h.canManage"> The organiser chooses this.</template>
        </p>
      </section>
      <section v-if="notVoted.length && h.isOpen" class="card card-pad">
        <h3 class="font-bold">Still to vote</h3>
        <AvatarStack class="mt-3" :people="notVoted" :size="32" :max="8" />
        <p class="mt-2 text-sm text-ink-soft">{{ notVoted.map((p) => p.name.split(' ')[0]).join(', ') }}</p>
      </section>
    </aside>

    <div class="lg:col-span-2">
      <NextStepBar>
        <BaseButton :icon-right="ArrowRight" :disabled="!h.activities.length" @click="router.push({ name: 'hangout-meeting-point', params: { hangoutId: h.hangoutId } })">Next: find the meeting point</BaseButton>
      </NextStepBar>
    </div>
  </div>
</template>

<style scoped>
.list-move {
  transition: transform 0.35s var(--ease-out-soft);
}
</style>
