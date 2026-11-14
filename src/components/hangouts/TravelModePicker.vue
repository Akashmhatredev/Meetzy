<script setup>
import { computed } from 'vue'
import { TRAVEL_MODES } from '@/utils/domain'

const model = defineModel({ type: String, default: 'DRIVE' })
defineProps({ showNote: { type: Boolean, default: true } })
const current = computed(() => TRAVEL_MODES.find((m) => m.value === model.value))
</script>

<template>
  <div class="@container">
    <div role="radiogroup" aria-label="Travel mode" class="grid grid-cols-3 gap-2 @lg:grid-cols-5">
      <button
        v-for="m in TRAVEL_MODES"
        :key="m.value"
        type="button"
        role="radio"
        :aria-checked="model === m.value"
        class="flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-semibold transition-[border-color,background-color,color]"
        :class="
          model === m.value
            ? 'border-mint-500 bg-mint-50 text-ink dark:bg-mint-900/30'
            : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
        "
        @click="model = m.value"
      >
        <component :is="m.icon" :size="20" aria-hidden="true" />
        {{ m.label }}
      </button>
    </div>
    <p v-if="showNote && current?.note" class="mt-2 text-sm text-muted">{{ current.note }}</p>
  </div>
</template>
