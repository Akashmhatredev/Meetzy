<script setup>
import { computed, ref, watch } from 'vue'
import { initials } from '@/utils/format'

const props = defineProps({
  name: { type: String, default: '' },
  src: { type: String, default: null },
  size: { type: Number, default: 40 },
  color: { type: String, default: null }, // ring colour (member route colour)
})

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

// Deterministic soft background from the name, so initials aren't all grey.
const PALETTE = ['#D5F6E7', '#E3F0FF', '#EFEBFE', '#FFF1E2', '#FFE8EF', '#EEF2F8']
const bg = computed(() => {
  let h = 0
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
})
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-navy-900 select-none"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.max(10, Math.round(size * 0.36))}px`,
      background: bg,
      boxShadow: color ? `0 0 0 2px var(--mz-surface), 0 0 0 4px ${color}` : undefined,
    }"
    :title="name || undefined"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name ? `${name}'s avatar` : ''"
      class="h-full w-full object-cover"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <span v-else aria-hidden="true">{{ initials(name) }}</span>
    <span v-if="!src || failed" class="sr-only">{{ name }}</span>
  </span>
</template>
