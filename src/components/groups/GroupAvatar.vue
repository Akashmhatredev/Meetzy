<script setup>
import { computed, ref } from 'vue'
import { GROUP_COLORS } from '@/utils/domain'

const props = defineProps({
  group: { type: Object, required: true }, // { avatar_emoji, avatar_url, color, name }
  size: { type: Number, default: 48 },
})
const failed = ref(false)
const tone = computed(() => GROUP_COLORS[props.group.color] ?? GROUP_COLORS.mint)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden"
    :class="tone.bg"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.32)}px`,
      fontSize: `${Math.round(size * 0.5)}px`,
    }"
  >
    <img
      v-if="group.avatar_url && !failed"
      :src="group.avatar_url"
      :alt="`${group.name ?? 'Group'} avatar`"
      class="h-full w-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <span v-else role="img" :aria-label="`${group.name ?? 'Group'} avatar`">{{ group.avatar_emoji || '👋' }}</span>
  </span>
</template>
