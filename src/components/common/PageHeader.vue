<script setup>
import { ArrowLeft } from 'lucide-vue-next'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  back: { type: [String, Object], default: null },
  backLabel: { type: String, default: 'Back' },
})
</script>

<template>
  <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <RouterLink
        v-if="back"
        :to="back"
        class="mb-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        {{ backLabel }}
      </RouterLink>
      <p v-if="eyebrow" class="eyebrow mb-1.5">{{ eyebrow }}</p>
      <h1 class="text-2xl font-extrabold sm:text-[1.75rem]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1.5 max-w-2xl text-[0.9375rem] text-ink-soft">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
