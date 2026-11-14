<script setup>
import { computed } from 'vue'

const props = defineProps({
  tone: { type: String, default: 'slate' }, // mint | sky | lavender | sun | rose | navy | slate
  dot: { type: Boolean, default: true },
})

const TONES = {
  mint: 'bg-mint-100 text-mint-800 dark:bg-mint-900/50 dark:text-mint-200',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-200',
  lavender: 'bg-lavender-100 text-lavender-700 dark:bg-lavender-700/30 dark:text-lavender-200',
  sun: 'bg-sun-100 text-sun-700 dark:bg-sun-700/30 dark:text-sun-200',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-700/30 dark:text-rose-100',
  navy: 'bg-navy-900 text-mint-300 dark:bg-mint-400 dark:text-navy-900',
  slate: 'bg-surface-2 text-ink-soft',
}
const cls = computed(() => TONES[props.tone] ?? TONES.slate)
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap" :class="cls">
    <span v-if="dot" class="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
    <slot />
  </span>
</template>
