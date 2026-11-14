<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import GroupAvatar from '@/components/groups/GroupAvatar.vue'
import GroupLookPicker from '@/components/groups/GroupLookPicker.vue'
import { useGroupsStore } from '@/stores/groups'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'

const groups = useGroupsStore()
const ui = useUiStore()
const router = useRouter()
const form = reactive({ name: '', description: '', emoji: '🎉', color: 'mint' })
const errors = ref({})
const busy = ref(false)
const examples = ['Office Friends', 'College Gang', 'Weekend Squad', 'Travel Buddies']

async function submit() {
  errors.value = v.validateAll({
    name: [v.required('Group name', 2, 50), form.name],
    description: [v.optionalMax('Description', 280), form.description],
  })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    const group = await groups.create(form)
    ui.success(`${group.name} is ready. Invite your friends!`)
    router.replace({ name: 'group-members', params: { groupId: group.id }, query: { invite: '1' } })
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="Create a group" subtitle="You'll be the admin. Invite friends right after." back="/groups" back-label="Groups" />
    <form class="card card-pad space-y-6" novalidate @submit.prevent="submit">
      <div class="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
        <GroupAvatar :group="{ avatar_emoji: form.emoji, color: form.color, name: form.name }" :size="60" />
        <div class="min-w-0">
          <p class="truncate font-display text-lg font-bold">{{ form.name || 'Your group' }}</p>
          <p class="truncate text-sm text-muted">{{ form.description || 'Preview' }}</p>
        </div>
      </div>
      <div>
        <BaseInput v-model="form.name" label="Group name" placeholder="Weekend Squad" :maxlength="50" :error="errors.name" autofocus />
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button v-for="e in examples" :key="e" type="button" class="chip hover:border-line-strong hover:text-ink" @click="form.name = e">{{ e }}</button>
        </div>
      </div>
      <BaseInput v-model="form.description" label="Description (optional)" textarea :rows="2" :maxlength="280" show-count :error="errors.description" placeholder="Saturday plans, birthdays, and the occasional go-kart rematch." />
      <GroupLookPicker v-model:emoji="form.emoji" v-model:color="form.color" />
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="secondary" to="/groups">Cancel</BaseButton>
        <BaseButton type="submit" :loading="busy">Create group</BaseButton>
      </div>
    </form>
  </div>
</template>
