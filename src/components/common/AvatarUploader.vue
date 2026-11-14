<script setup>
import { ref } from 'vue'
import { Camera, Trash2 } from 'lucide-vue-next'
import { uploadAvatar } from '@/services/supabase/profiles'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const props = defineProps({
  folder: { type: String, required: true }, // "<uid>" or "groups/<group id>"
  current: { type: String, default: null },
})
const emit = defineEmits(['uploaded', 'removed'])
const ui = useUiStore()
const input = ref(null)
const busy = ref(false)

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    const url = await uploadAvatar(props.folder, file)
    emit('uploaded', url)
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-4">
    <slot :busy="busy" />
    <div class="flex flex-wrap gap-2">
      <input ref="input" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" tabindex="-1" @change="onFile" />
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60"
        :disabled="busy"
        @click="input.click()"
      >
        <Camera :size="16" aria-hidden="true" /> {{ busy ? 'Uploading…' : current ? 'Change photo' : 'Upload photo' }}
      </button>
      <button
        v-if="current"
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
        :disabled="busy"
        @click="emit('removed')"
      >
        <Trash2 :size="16" aria-hidden="true" /> Remove
      </button>
    </div>
  </div>
</template>
