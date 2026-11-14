<script setup>
import { computed, ref, useId } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'

const model = defineModel({ type: [String, Number], default: '' })
const props = defineProps({
  label: { type: String, default: '' },
  type: { type: String, default: 'text' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  textarea: { type: Boolean, default: false },
  rows: { type: Number, default: 3 },
  maxlength: { type: Number, default: null },
  showCount: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
})

const id = useId()
const reveal = ref(false)
const inputType = computed(() => (props.type === 'password' && reveal.value ? 'text' : props.type))
const describedBy = computed(() => [props.error && `${id}-error`, props.hint && `${id}-hint`].filter(Boolean).join(' ') || undefined)
const fieldClass = computed(() => [
  'w-full rounded-2xl border bg-surface text-[0.9375rem] text-ink placeholder:text-muted transition-[border-color,box-shadow] duration-150 outline-none',
  'focus:border-mint-500 focus:shadow-ring',
  props.error ? 'border-danger' : 'border-line-strong hover:border-navy-300 dark:hover:border-navy-600',
  props.icon ? 'pl-11' : 'pl-4',
  props.type === 'password' ? 'pr-11' : 'pr-4',
  props.textarea ? 'py-3 resize-y min-h-24' : 'h-12',
])
</script>

<template>
  <div class="w-full">
    <div v-if="label" class="mb-1.5 flex items-baseline justify-between gap-2" :class="hideLabel && 'sr-only'">
      <label :for="id" class="text-sm font-semibold text-ink">{{ label }}</label>
      <span v-if="showCount && maxlength" class="text-xs text-muted tabular-nums">{{ String(model ?? '').length }}/{{ maxlength }}</span>
    </div>
    <div class="relative">
      <component
        :is="icon"
        v-if="icon"
        :size="18"
        class="pointer-events-none absolute top-3.5 left-4 text-muted"
        aria-hidden="true"
      />
      <textarea
        v-if="textarea"
        :id="id"
        v-model="model"
        :rows="rows"
        :maxlength="maxlength ?? undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :class="fieldClass"
        v-bind="$attrs"
      />
      <input
        v-else
        :id="id"
        v-model="model"
        :type="inputType"
        :maxlength="maxlength ?? undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :class="fieldClass"
        v-bind="$attrs"
      />
      <button
        v-if="type === 'password'"
        type="button"
        class="absolute top-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
        :aria-label="reveal ? 'Hide password' : 'Show password'"
        @click="reveal = !reveal"
      >
        <EyeOff v-if="reveal" :size="18" aria-hidden="true" />
        <Eye v-else :size="18" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-sm font-medium text-danger" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="`${id}-hint`" class="mt-1.5 text-sm text-muted">{{ hint }}</p>
  </div>
</template>

<script>
export default { inheritAttrs: false }
</script>
