<script setup>
import { useId } from 'vue'

const model = defineModel({ type: Boolean, default: false })
defineProps({
  label: { type: String, required: true },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const id = useId()
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <label :for="id" class="text-sm font-semibold text-ink">{{ label }}</label>
      <p v-if="description" class="mt-0.5 text-sm text-ink-soft">{{ description }}</p>
    </div>
    <button
      :id="id"
      type="button"
      role="switch"
      :aria-checked="model"
      :aria-busy="busy ? 'true' : undefined"
      :disabled="disabled || busy"
      class="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50"
      :class="model ? 'bg-mint-500' : 'bg-line-strong'"
      @click="model = !model"
    >
      <span
        class="inline-block h-5.5 w-5.5 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-out-soft)]"
        :class="model ? 'translate-x-[23px]' : 'translate-x-[3px]'"
      />
    </button>
  </div>
</template>
