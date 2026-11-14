<script setup>
import { Scale, Users, Zap } from 'lucide-vue-next'
import { STRATEGIES } from '@engine/ranking.js'

const model = defineModel({ type: String, default: 'fair' })
defineProps({ disabled: { type: Boolean, default: false } })

const ICONS = { fair: Scale, balanced: Users, fastest: Zap }
const ORDER = ['fair', 'balanced', 'fastest']
</script>

<template>
  <div class="@container">
  <div role="radiogroup" aria-label="Optimisation strategy" class="grid grid-cols-1 gap-2 @xl:grid-cols-3">
    <button
      v-for="key in ORDER"
      :key="key"
      type="button"
      role="radio"
      :aria-checked="model === key"
      :disabled="disabled"
      class="flex flex-col items-start rounded-2xl border p-4 text-left transition-[border-color,background-color] disabled:cursor-default"
      :class="model === key ? 'border-mint-500 bg-mint-50 dark:bg-mint-900/30' : 'border-line hover:border-line-strong disabled:hover:border-line'"
      @click="model = key"
    >
      <span class="flex items-center gap-2 font-display font-bold">
        <component :is="ICONS[key]" :size="18" :class="model === key ? 'text-accent-ink' : 'text-muted'" aria-hidden="true" />
        {{ STRATEGIES[key].label }}
        <span v-if="key === 'fair'" class="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted uppercase">Default</span>
      </span>
      <span class="mt-1 text-sm text-ink-soft">{{ STRATEGIES[key].description }}</span>
    </button>
  </div>
  </div>
</template>
