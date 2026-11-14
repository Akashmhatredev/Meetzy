<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Plus, ArrowRight } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import ActivityIcon from '@/components/activities/ActivityIcon.vue'
import NextStepBar from '@/components/hangouts/NextStepBar.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { ACTIVITY_CATEGORIES } from '@/utils/domain'
import { errorMessage } from '@/utils/errors'
import { plural } from '@/utils/format'

const h = useHangoutStore()
const ui = useUiStore()
const router = useRouter()
const pending = ref(new Set())
const custom = ref('')
const customError = ref('')
const adding = ref(false)

const CATEGORY_TONE = {
  food: 'bg-sun-100 text-sun-700 dark:bg-sun-700/30 dark:text-sun-200',
  entertainment: 'bg-lavender-100 text-lavender-700 dark:bg-lavender-700/30 dark:text-lavender-200',
  outdoor: 'bg-mint-100 text-mint-700 dark:bg-mint-900/50 dark:text-mint-300',
  shopping: 'bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-200',
  other: 'bg-rose-100 text-rose-700 dark:bg-rose-700/30 dark:text-rose-100',
}

const votersFor = (activityId) => h.activities.find((a) => a.id === activityId)?.voters ?? []
const people = (ids) => ids.map((id) => h.personById.get(id)).filter(Boolean)

const sections = computed(() => {
  const customOnes = h.activities.filter((a) => a.is_custom)
  return ACTIVITY_CATEGORIES.map((c) => ({
    ...c,
    items: c.value === 'other' ? customOnes : h.catalogue.filter((a) => a.category === c.value),
  }))
})

async function toggle(activity) {
  if (!h.isOpen || pending.value.has(activity.id)) return
  const next = !h.myActivityIds.has(activity.id)
  pending.value = new Set([...pending.value, activity.id])
  try {
    await h.toggleActivity(activity.id, next)
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    const s = new Set(pending.value)
    s.delete(activity.id)
    pending.value = s
  }
}

async function addCustom() {
  const name = custom.value.trim().replace(/\s+/g, ' ')
  customError.value = name.length < 2 || name.length > 40 ? 'Use 2 to 40 characters.' : ''
  if (customError.value) return
  adding.value = true
  try {
    await h.addCustomActivity(name)
    custom.value = ''
    ui.success(`Added "${name}". Meetzy will search Google Places for it.`)
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-col gap-1">
      <h2 class="text-xl font-bold">What do you feel like doing?</h2>
      <p class="text-ink-soft">Pick as many as you like. Each pick is your vote; the group's favourites decide where Meetzy searches.</p>
    </div>

    <div class="space-y-7">
      <section v-for="s in sections" :key="s.value" :aria-labelledby="`cat-${s.value}`">
        <h3 :id="`cat-${s.value}`" class="mb-3 text-sm font-bold tracking-wide text-muted uppercase">{{ s.label }}</h3>
        <ul class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <li v-for="a in s.items" :key="a.id">
            <button
              type="button"
              :aria-pressed="h.myActivityIds.has(a.id)"
              :disabled="!h.isOpen"
              class="relative flex h-full w-full flex-col items-start gap-3 rounded-3xl border p-4 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-default"
              :class="h.myActivityIds.has(a.id) ? 'border-mint-500 bg-mint-50 shadow-soft dark:bg-mint-900/30' : 'border-line bg-surface hover:border-line-strong'"
              @click="toggle(a)"
            >
              <span class="flex h-11 w-11 items-center justify-center rounded-2xl" :class="CATEGORY_TONE[a.category]">
                <ActivityIcon :name="a.icon" :size="22" />
              </span>
              <span class="font-display font-bold">{{ a.name }}</span>
              <span class="flex min-h-7 w-full items-center justify-between gap-2">
                <AvatarStack v-if="votersFor(a.id).length" :people="people(votersFor(a.id))" :size="24" :max="3" />
                <span v-else class="text-xs text-muted">No votes yet</span>
              </span>
              <span
                class="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors"
                :class="h.myActivityIds.has(a.id) ? 'border-mint-500 bg-mint-500 text-white' : 'border-line-strong'"
                aria-hidden="true"
              >
                <Check v-if="h.myActivityIds.has(a.id)" :size="14" stroke-width="3" />
              </span>
            </button>
          </li>
          <li v-if="s.value === 'other' && h.isOpen" class="col-span-2 sm:col-span-3 lg:col-span-2">
            <form class="flex h-full flex-col justify-center gap-2 rounded-3xl border border-dashed border-line-strong p-4" @submit.prevent="addCustom">
              <BaseInput v-model="custom" label="Custom activity" placeholder="Karaoke, board games, pottery…" :maxlength="40" :error="customError" />
              <BaseButton type="submit" size="sm" variant="secondary" :icon="Plus" :loading="adding" class="self-start">Add activity</BaseButton>
            </form>
          </li>
        </ul>
      </section>
    </div>

    <NextStepBar :hint="h.activities.length ? `${plural(h.activities.length, 'activity', 'activities')} shortlisted by ${plural(h.activityVoterCount, 'person', 'people')}` : 'Pick at least one activity.'">
      <BaseButton variant="secondary" :to="{ name: 'hangout-activity-vote', params: { hangoutId: h.hangoutId } }">See the vote</BaseButton>
      <BaseButton :icon-right="ArrowRight" :disabled="!h.activities.length" @click="router.push({ name: 'hangout-meeting-point', params: { hangoutId: h.hangoutId } })">
        Next: meeting point
      </BaseButton>
    </NextStepBar>
  </div>
</template>
