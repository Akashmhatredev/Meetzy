<script setup>
/**
 * The page's primary forward action. Sticky above the mobile bottom nav,
 * inline on desktop, so the next step is always within thumb reach.
 */
defineProps({
  hint: { type: String, default: '' },
})
</script>

<template>
  <div
    class="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-8 rounded-3xl border border-line bg-surface/95 p-2.5 shadow-lift backdrop-blur-md sm:p-3 lg:static lg:bottom-auto lg:bg-surface lg:shadow-soft lg:backdrop-blur-none"
  >
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p v-if="hint" class="px-2 text-xs text-ink-soft sm:text-sm">{{ hint }}</p>
      <div class="flex gap-2 *:min-w-0 *:flex-1 sm:ml-auto sm:*:flex-none">
        <slot />
      </div>
    </div>
  </div>
</template>
