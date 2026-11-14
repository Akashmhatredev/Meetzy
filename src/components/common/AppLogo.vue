<script setup>
/**
 * Meetzy mark: a location pin whose centre is two overlapping rings, two
 * people meeting in the middle. Works from 16px favicons to app icons.
 */
defineProps({
  size: { type: Number, default: 32 },
  wordmark: { type: Boolean, default: true },
  tone: { type: String, default: 'auto' }, // auto | light | dark
})
</script>

<template>
  <span class="inline-flex items-center gap-2" :class="tone === 'light' ? 'text-white' : tone === 'dark' ? 'text-navy-900' : 'text-ink'">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Meetzy"
      class="shrink-0"
    >
      <path
        d="M32 61C29.2 57.4 9 39.6 9 25.8 9 13.2 19.3 3 32 3s23 10.2 23 22.8C55 39.6 34.8 57.4 32 61Z"
        fill="#65D6A4"
      />
      <circle cx="25.5" cy="25.5" r="9" stroke="#101827" stroke-width="4.5" />
      <circle cx="38.5" cy="25.5" r="9" stroke="#101827" stroke-width="4.5" />
      <path d="M32 18.6a9 9 0 0 1 0 13.8 9 9 0 0 1 0-13.8Z" fill="#101827" />
    </svg>
    <span
      v-if="wordmark"
      class="font-display font-extrabold tracking-tight"
      :style="{ fontSize: `${Math.round(size * 0.66)}px`, lineHeight: 1 }"
      >meetzy</span
    >
  </span>
</template>
