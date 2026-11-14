<script setup>
import { computed } from 'vue'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({
  people: { type: Array, required: true }, // [{ name, avatarUrl }]
  max: { type: Number, default: 4 },
  size: { type: Number, default: 30 },
})
const shown = computed(() => props.people.slice(0, props.max))
const extra = computed(() => Math.max(0, props.people.length - props.max))
</script>

<template>
  <div class="flex items-center" :aria-label="`${people.length} people`">
    <span
      v-for="(p, i) in shown"
      :key="p.userId ?? p.name ?? i"
      class="rounded-full ring-2 ring-surface"
      :style="{ marginLeft: i ? `-${Math.round(size * 0.28)}px` : 0 }"
    >
      <UserAvatar :name="p.name" :src="p.avatarUrl" :size="size" />
    </span>
    <span
      v-if="extra"
      class="flex items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink-soft ring-2 ring-surface"
      :style="{ width: `${size}px`, height: `${size}px`, marginLeft: `-${Math.round(size * 0.28)}px` }"
      >+{{ extra }}</span
    >
  </div>
</template>
