<script setup>
const model = defineModel({ type: [String, Number, Boolean], default: null })
defineProps({
  options: { type: Array, required: true }, // [{ value, label, icon? }]
  label: { type: String, required: true },
  size: { type: String, default: 'md' },
})
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex w-full rounded-2xl bg-surface-2 p-1 sm:w-auto">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      class="flex flex-1 items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 sm:flex-none"
      :class="[
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-sm',
        model === o.value ? 'bg-surface text-ink shadow-soft' : 'text-ink-soft hover:text-ink',
      ]"
      @click="model = o.value"
    >
      <component :is="o.icon" v-if="o.icon" :size="15" aria-hidden="true" />
      {{ o.label }}
    </button>
  </div>
</template>
