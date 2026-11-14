<script setup>
/**
 * Google Places photo with the author attribution Google requires.
 */
import { computed, ref } from 'vue'
import ActivityIcon from '@/components/activities/ActivityIcon.vue'

const props = defineProps({
  venue: { type: Object, required: true },
  icon: { type: String, default: 'sparkles' },
  aspect: { type: String, default: 'aspect-[16/10]' },
})
const failed = ref(false)
const attribution = computed(() => {
  const list = Array.isArray(props.venue.photo_attributions) ? props.venue.photo_attributions : []
  return list.find((a) => a?.displayName) ?? null
})
</script>

<template>
  <div class="relative overflow-hidden bg-surface-2" :class="aspect">
    <img
      v-if="venue.photo_uri && !failed"
      :src="venue.photo_uri"
      :alt="`Photo of ${venue.name}`"
      class="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <div v-else class="absolute inset-0 flex items-center justify-center text-muted">
      <ActivityIcon :name="icon" :size="32" />
    </div>
    <a
      v-if="attribution && venue.photo_uri && !failed"
      :href="attribution.uri || undefined"
      target="_blank"
      rel="noopener noreferrer"
      class="absolute right-2 bottom-2 max-w-[70%] truncate rounded-md bg-navy-950/65 px-1.5 py-0.5 text-[10px] font-medium text-white hover:underline"
      >Photo: {{ attribution.displayName }}</a
    >
    <slot />
  </div>
</template>
