<script setup>
import { useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const model = defineModel({ type: [String, Number, null], default: null })
defineProps({
  label: { type: String, default: '' },
  options: { type: Array, required: true }, // [{ value, label }]
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
})
const id = useId()
</script>

<template>
  <div class="w-full">
    <label v-if="label" :for="id" class="mb-1.5 block text-sm font-semibold text-ink">{{ label }}</label>
    <div class="relative">
      <select
        :id="id"
        v-model="model"
        class="h-12 w-full appearance-none rounded-2xl border bg-surface pr-10 pl-4 text-[0.9375rem] text-ink outline-none transition-[border-color,box-shadow] focus:border-mint-500 focus:shadow-ring"
        :class="error ? 'border-danger' : 'border-line-strong hover:border-navy-300 dark:hover:border-navy-600'"
        :aria-invalid="error ? 'true' : undefined"
        v-bind="$attrs"
      >
        <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
      </select>
      <ChevronDown :size="18" class="pointer-events-none absolute top-3.5 right-3.5 text-muted" aria-hidden="true" />
    </div>
    <p v-if="error" class="mt-1.5 text-sm font-medium text-danger" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-sm text-muted">{{ hint }}</p>
  </div>
</template>

<script>
export default { inheritAttrs: false }
</script>
