<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Vote, Trophy, Timer, Lock, PartyPopper, Store, Undo2 } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import VenuePhoto from '@/components/venues/VenuePhoto.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { summaryOf } from '@/services/midpoint'
import { duration, dateTime, fromLocalInput, plural } from '@/utils/format'
import { errorMessage } from '@/utils/errors'

const h = useHangoutStore()
const ui = useUiStore()
const router = useRouter()
const now = ref(Date.now())
let timer = null
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 30000)))
onBeforeUnmount(() => clearInterval(timer))

const candidates = computed(() => h.rankedVenues.slice(0, 8))
const deadline = computed(() => (h.hangout.voting_deadline ? new Date(h.hangout.voting_deadline) : null))
const deadlinePassed = computed(() => deadline.value && deadline.value.getTime() <= now.value)
const votingOpen = computed(() => ['venue_discovery', 'voting'].includes(h.hangout.status) && !deadlinePassed.value)
const totalVotes = computed(() => h.venueVotes.length)
const votersFor = (venueId) => h.venueVotes.filter((v) => v.venue_id === venueId).map((v) => h.personById.get(v.user_id)).filter(Boolean)
const leader = computed(() => h.venues.find((v) => v.id === h.leaderVenueId) ?? null)
const remaining = computed(() => {
  if (!deadline.value || deadlinePassed.value) return ''
  const mins = Math.round((deadline.value.getTime() - now.value) / 60000)
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min left` : `${Math.max(1, mins)} min left`
})

const busy = ref(null)
async function vote(id) {
  busy.value = id
  try {
    if (h.myVenueVote === id) await h.clearVote()
    else await h.vote(id)
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = null
  }
}

// Organiser: open voting with an optional deadline
const openDialog = ref(false)
const deadlineInput = ref('')
async function openVoting() {
  try {
    await h.setStatus('voting', fromLocalInput(deadlineInput.value))
    openDialog.value = false
    ui.success('Voting is open. Everyone has been notified.')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

// Organiser: finalise
const finalizeDialog = ref(false)
const finalChoice = ref(null)
function startFinalize() {
  finalChoice.value = h.leaderVenueId ?? h.myVenueVote ?? candidates.value[0]?.id ?? null
  finalizeDialog.value = true
}
async function finalize() {
  if (!finalChoice.value) return
  busy.value = 'finalize'
  try {
    await h.finalize(finalChoice.value)
    finalizeDialog.value = false
    router.push({ name: 'hangout-confirmed', params: { hangoutId: h.hangoutId } })
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = null
  }
}
async function reopen() {
  try {
    await h.setStatus('voting')
    ui.success('Plan reopened for voting.')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}
</script>

<template>
  <div>
    <div v-if="!h.venues.length" class="card">
      <EmptyState :icon="Store" title="Nothing to vote on yet" description="Find the meeting point first to get venues." compact>
        <BaseButton :to="{ name: 'hangout-meeting-point', params: { hangoutId: h.hangoutId } }">Find the meeting point</BaseButton>
      </EmptyState>
    </div>
    <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section>
        <div class="mb-4">
          <h2 class="text-xl font-bold">Where should we meet?</h2>
          <p class="text-ink-soft">One vote each, and you can change it until voting closes. Results update live.</p>
        </div>
        <ul class="space-y-3">
          <li v-for="v in candidates" :key="v.id">
            <div
              class="flex items-stretch overflow-hidden rounded-3xl border bg-surface shadow-soft transition-colors"
              :class="h.myVenueVote === v.id ? 'border-mint-500 ring-2 ring-mint-400/40' : 'border-line'"
            >
              <VenuePhoto :venue="v" aspect="" class="hidden w-28 shrink-0 sm:block" />
              <div class="min-w-0 flex-1 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="flex items-center gap-2 font-display font-bold">
                      <span class="truncate">{{ v.name }}</span>
                      <Trophy v-if="h.leaderVenueId === v.id" :size="16" class="shrink-0 text-sun-500" aria-label="Leading" />
                    </p>
                    <p class="text-sm text-muted">#{{ v.rank }} · longest trip {{ duration(summaryOf(v).max) }} · avg {{ duration(summaryOf(v).avg) }}</p>
                  </div>
                  <button
                    v-if="votingOpen"
                    type="button"
                    :aria-pressed="h.myVenueVote === v.id"
                    :disabled="busy === v.id"
                    class="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors"
                    :class="h.myVenueVote === v.id ? 'bg-accent text-on-accent' : 'border border-line-strong hover:bg-surface-2'"
                    @click="vote(v.id)"
                  >
                    <component :is="h.myVenueVote === v.id ? Check : Vote" :size="16" aria-hidden="true" />
                    {{ h.myVenueVote === v.id ? 'Your vote' : 'Vote' }}
                  </button>
                </div>
                <div class="mt-3 flex items-center gap-3">
                  <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div class="h-full rounded-full bg-mint-400 transition-[width] duration-500" :style="{ width: `${((h.voteCounts.get(v.id) ?? 0) / Math.max(1, h.people.length)) * 100}%` }" />
                  </div>
                  <span class="text-sm font-bold tabular-nums">{{ h.voteCounts.get(v.id) ?? 0 }}</span>
                  <AvatarStack v-if="votersFor(v.id).length" :people="votersFor(v.id)" :size="22" :max="4" />
                </div>
              </div>
            </div>
          </li>
        </ul>
        <RouterLink :to="{ name: 'hangout-venues', params: { hangoutId: h.hangoutId } }" class="link mt-4 inline-block text-sm">See all {{ h.venues.length }} venues with details</RouterLink>
      </section>

      <aside class="space-y-5">
        <section class="card card-pad">
          <h3 class="font-bold">Vote status</h3>
          <p class="mt-1 text-sm text-ink-soft">{{ plural(totalVotes, 'vote') }} from {{ h.people.length }} {{ h.people.length === 1 ? 'member' : 'members' }}</p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div class="h-full rounded-full bg-mint-400" :style="{ width: `${(totalVotes / Math.max(1, h.people.length)) * 100}%` }" />
          </div>
          <p v-if="leader" class="mt-4 flex items-center gap-2 text-sm"><Trophy :size="16" class="text-sun-500" aria-hidden="true" /> <span><strong>{{ leader.name }}</strong> is leading</span></p>
          <p v-else-if="totalVotes" class="mt-4 text-sm text-ink-soft">It's a tie right now.</p>
          <p v-if="deadline" class="mt-3 flex items-center gap-2 text-sm" :class="deadlinePassed ? 'text-danger' : 'text-ink-soft'">
            <Timer :size="16" aria-hidden="true" />
            {{ deadlinePassed ? `Voting closed ${dateTime(deadline)}` : `Closes ${dateTime(deadline)} · ${remaining}` }}
          </p>
          <p v-if="h.hangout.status === 'finalized'" class="mt-3 flex items-center gap-2 text-sm font-semibold text-accent-ink"><Lock :size="16" aria-hidden="true" /> Finalised</p>
        </section>

        <section v-if="h.canManage" class="card card-pad space-y-3">
          <h3 class="font-bold">Organiser</h3>
          <template v-if="h.hangout.status === 'venue_discovery'">
            <p class="text-sm text-ink-soft">Members can already vote. Formally open voting to notify everyone and set a deadline.</p>
            <BaseButton block variant="secondary" :icon="Timer" @click="openDialog = true">Open voting & notify</BaseButton>
          </template>
          <template v-if="['venue_discovery', 'voting'].includes(h.hangout.status)">
            <BaseButton block :icon="PartyPopper" @click="startFinalize">Finalise the destination</BaseButton>
            <p class="text-xs text-muted">You can pick any venue, even if it isn't leading.</p>
          </template>
          <template v-else-if="h.hangout.status === 'finalized'">
            <BaseButton block :to="{ name: 'hangout-confirmed', params: { hangoutId: h.hangoutId } }">View final plan</BaseButton>
            <BaseButton block variant="ghost" :icon="Undo2" @click="reopen">Reopen voting</BaseButton>
          </template>
        </section>
        <section v-else-if="h.hangout.status === 'finalized'" class="card card-pad">
          <BaseButton block :to="{ name: 'hangout-confirmed', params: { hangoutId: h.hangoutId } }">View final plan</BaseButton>
        </section>
      </aside>
    </div>

    <BaseDialog v-model:open="openDialog" title="Open voting" description="Everyone in the group gets a notification." size="sm">
      <BaseInput v-model="deadlineInput" type="datetime-local" label="Deadline (optional)" hint="Votes can't change after this time." />
      <template #footer>
        <BaseButton variant="secondary" @click="openDialog = false">Cancel</BaseButton>
        <BaseButton @click="openVoting">Open voting</BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-model:open="finalizeDialog" title="Finalise the destination" description="Members are notified and get directions." size="md">
      <fieldset class="space-y-2">
        <legend class="sr-only">Venue</legend>
        <label
          v-for="v in candidates"
          :key="v.id"
          class="flex cursor-pointer items-center gap-3 rounded-2xl border p-3"
          :class="finalChoice === v.id ? 'border-mint-500 bg-mint-50 dark:bg-mint-900/30' : 'border-line'"
        >
          <input v-model="finalChoice" type="radio" name="final-venue" :value="v.id" class="h-4 w-4 accent-mint-600" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ v.name }}</span>
            <span class="block text-xs text-muted">{{ plural(h.voteCounts.get(v.id) ?? 0, 'vote') }} · longest trip {{ duration(summaryOf(v).max) }}</span>
          </span>
          <Trophy v-if="h.leaderVenueId === v.id" :size="16" class="text-sun-500" aria-label="Leading" />
        </label>
      </fieldset>
      <template #footer>
        <BaseButton variant="secondary" @click="finalizeDialog = false">Cancel</BaseButton>
        <BaseButton :disabled="!finalChoice" :loading="busy === 'finalize'" @click="finalize">Finalise</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
