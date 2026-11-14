<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import TravelModePicker from '@/components/hangouts/TravelModePicker.vue'
import StrategyPicker from '@/components/hangouts/StrategyPicker.vue'
import { createHangout } from '@/services/supabase/hangouts'
import { useGroupStore } from '@/stores/group'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { fromLocalInput } from '@/utils/format'
import * as v from '@/utils/validation'

const group = useGroupStore()
const groups = useGroupsStore()
const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()

const SUGGESTIONS = ['Saturday hangout', 'Friday dinner', 'Birthday plans', 'Movie night', 'Sunday brunch']
const form = reactive({
  title: '',
  notes: '',
  scheduledFor: '',
  travelMode: auth.profile?.preferred_travel_mode ?? 'DRIVE',
  strategy: 'fair',
  activityMode: 'all_selected',
  maxTravelMinutes: null,
})
const errors = ref({})
const busy = ref(false)

const MAX_TRAVEL = [
  { value: null, label: 'No limit' },
  { value: 20, label: 'Up to 20 min' },
  { value: 30, label: 'Up to 30 min' },
  { value: 45, label: 'Up to 45 min' },
  { value: 60, label: 'Up to 1 hour' },
  { value: 90, label: 'Up to 1.5 hours' },
]

async function submit() {
  errors.value = v.validateAll({
    title: [v.required('Title', 2, 80), form.title],
    notes: [v.optionalMax('Notes', 500), form.notes],
    scheduledFor: [(x) => (x && new Date(x) < Date.now() - 60000 ? 'Pick a time in the future.' : ''), form.scheduledFor],
  })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    const hangout = await createHangout(group.groupId, {
      ...form,
      title: form.title.trim(),
      scheduledFor: fromLocalInput(form.scheduledFor),
    })
    groups.load({ silent: true })
    ui.success('Hangout created. First, share where you are.')
    router.replace({ name: 'hangout-location', params: { hangoutId: hangout.id } })
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <PageHeader title="Plan a hangout" :subtitle="`For ${group.group.name}. Everyone in the group can join in.`" :back="`/groups/${group.groupId}`" :back-label="group.group.name" />
    <form class="space-y-5" novalidate @submit.prevent="submit">
      <section class="card card-pad space-y-5">
        <div>
          <BaseInput v-model="form.title" label="What's the plan?" placeholder="Saturday hangout" :maxlength="80" :error="errors.title" />
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="s in SUGGESTIONS" :key="s" type="button" class="chip hover:border-line-strong hover:text-ink" @click="form.title = s">{{ s }}</button>
          </div>
        </div>
        <BaseInput
          v-model="form.scheduledFor"
          label="When (optional)"
          type="datetime-local"
          :error="errors.scheduledFor"
          hint="With a time set, driving estimates use predicted traffic for then."
        />
        <BaseInput v-model="form.notes" label="Notes (optional)" textarea :rows="2" :maxlength="500" show-count :error="errors.notes" placeholder="Birthday surprise, keep it quiet!" />
      </section>

      <section class="card card-pad space-y-4">
        <div>
          <h2 class="text-lg font-bold">How is everyone getting there?</h2>
          <p class="text-sm text-ink-soft">Travel times come from Google for this mode.</p>
        </div>
        <TravelModePicker v-model="form.travelMode" />
        <BaseSelect v-model="form.maxTravelMinutes" :options="MAX_TRAVEL" label="Longest acceptable trip" hint="Venues where someone's trip is longer are flagged, not hidden." />
      </section>

      <section class="card card-pad space-y-4">
        <div>
          <h2 class="text-lg font-bold">What does "fair" mean to your group?</h2>
          <p class="text-sm text-ink-soft">You can change this later. Rankings update instantly.</p>
        </div>
        <StrategyPicker v-model="form.strategy" />
        <div>
          <p class="mb-2 text-sm font-semibold">Search venues for</p>
          <SegmentedControl
            v-model="form.activityMode"
            label="Activities used for venue search"
            :options="[
              { value: 'all_selected', label: 'All picked activities' },
              { value: 'most_popular', label: 'Most popular only' },
            ]"
          />
        </div>
      </section>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="secondary" :to="`/groups/${group.groupId}`">Cancel</BaseButton>
        <BaseButton type="submit" size="lg" :loading="busy">Create hangout</BaseButton>
      </div>
    </form>
  </div>
</template>
