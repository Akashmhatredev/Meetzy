<script setup>
import { reactive, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { toLocalInput, fromLocalInput } from '@/utils/format'
import * as v from '@/utils/validation'

const open = defineModel('open', { type: Boolean, default: false })
const h = useHangoutStore()
const ui = useUiStore()
const form = reactive({ title: '', notes: '', scheduled: '' })
const errors = ref({})
const busy = ref(false)

watch(open, (value) => {
  if (!value) return
  form.title = h.hangout.title
  form.notes = h.hangout.notes ?? ''
  form.scheduled = toLocalInput(h.hangout.scheduled_for)
  errors.value = {}
})

async function save() {
  errors.value = v.validateAll({
    title: [v.required('Title', 2, 80), form.title],
    notes: [v.optionalMax('Notes', 500), form.notes],
  })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    await h.updateSettings({ title: form.title.trim(), notes: form.notes.trim() || null, scheduled_for: fromLocalInput(form.scheduled) })
    ui.success('Hangout updated.')
    open.value = false
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" title="Edit hangout">
    <div class="space-y-4">
      <BaseInput v-model="form.title" label="Title" :maxlength="80" :error="errors.title" />
      <BaseInput v-model="form.scheduled" type="datetime-local" label="When" hint="Changing the time refreshes traffic-aware estimates on the next calculation." />
      <BaseInput v-model="form.notes" label="Notes" textarea :rows="3" :maxlength="500" show-count :error="errors.notes" />
    </div>
    <template #footer>
      <BaseButton variant="secondary" @click="open = false">Cancel</BaseButton>
      <BaseButton :loading="busy" @click="save">Save</BaseButton>
    </template>
  </BaseDialog>
</template>
