<script setup>
import { RouterLink } from 'vue-router'

defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  to: { type: [String, Object], default: null },
  size: { type: Number, default: 20 },
  variant: { type: String, default: 'ghost' }, // ghost | surface
  badge: { type: [Number, String], default: null },
})
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
    :aria-label="label"
    :title="label"
    class="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:text-ink active:scale-95"
    :class="variant === 'surface' ? 'border border-line bg-surface shadow-soft hover:bg-surface-2' : 'hover:bg-surface-2'"
  >
    <component :is="icon" :size="size" aria-hidden="true" stroke-width="2" />
    <span
      v-if="badge"
      class="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-canvas"
      >{{ badge }}</span
    >
  </component>
</template>
