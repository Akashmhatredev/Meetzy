<script setup>
defineProps({
  lines: { type: Number, default: 0 },
  height: { type: String, default: '1rem' },
  width: { type: String, default: '100%' },
  rounded: { type: String, default: 'rounded-xl' },
})
</script>

<template>
  <div v-if="lines" class="space-y-2.5" aria-hidden="true">
    <div
      v-for="n in lines"
      :key="n"
      class="skeleton"
      :class="rounded"
      :style="{ height, width: n === lines && lines > 1 ? '62%' : width }"
    />
  </div>
  <div v-else class="skeleton" :class="rounded" :style="{ height, width }" aria-hidden="true" />
</template>
