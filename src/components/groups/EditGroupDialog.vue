<script setup>
import { reactive, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import AvatarUploader from '@/components/common/AvatarUploader.vue'
import GroupAvatar from './GroupAvatar.vue'
import GroupLookPicker from './GroupLookPicker.vue'
import { updateGroup } from '@/services/supabase/groups'
import { useGroupStore } from '@/stores/group'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'

const open = defineModel('open', { type: Boolean, default: false })
const group = useGroupStore()
const ui = useUiStore()
const form = reactive({ name: '', description: '', avatar_emoji: '👋', color: 'mint', avatar_url: null })
const errors = ref({})
const busy = ref(false)

watch(open, (value) => {
  if (!value || !group.group) return
  Object.assign(form, {
    name: group.group.name,
    description: group.group.description ?? '',
    avatar_emoji: group.group.avatar_emoji,
    color: group.group.color,
    avatar_url: group.group.avatar_url,
  })
  errors.value = {}
})

async function save() {
  errors.value = v.validateAll({
    name: [v.required('Group name', 2, 50), form.name],
    description: [v.optionalMax('Description', 280), form.description],
  })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    await updateGroup(group.groupId, { ...form, name: form.name.trim(), description: form.description.trim() || null })
    await group.refresh()
    ui.success('Group updated.')
    open.value = false
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" title="Edit group" size="lg">
    <div class="space-y-5">
      <AvatarUploader :folder="`groups/${group.groupId}`" :current="form.avatar_url" @uploaded="(url) => (form.avatar_url = url)" @removed="form.avatar_url = null">
        <GroupAvatar :group="{ ...form, name: form.name }" :size="60" />
      </AvatarUploader>
      <BaseInput v-model="form.name" label="Group name" :maxlength="50" :error="errors.name" />
      <BaseInput v-model="form.description" label="Description" textarea :rows="2" :maxlength="280" show-count :error="errors.description" />
      <GroupLookPicker v-if="!form.avatar_url" v-model:emoji="form.avatar_emoji" v-model:color="form.color" />
    </div>
    <template #footer>
      <BaseButton variant="secondary" @click="open = false">Cancel</BaseButton>
      <BaseButton :loading="busy" @click="save">Save changes</BaseButton>
    </template>
  </BaseDialog>
</template>
