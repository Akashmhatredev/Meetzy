<script setup>
import { computed } from 'vue'
import { CalendarClock, MapPin, ChevronRight } from 'lucide-vue-next'
import StatusBadge from '@/components/common/StatusBadge.vue'
import GroupAvatar from '@/components/groups/GroupAvatar.vue'
import { HANGOUT_STATUS } from '@/utils/domain'
import { dateTime, timeAgo } from '@/utils/format'

const props = defineProps({
  hangout: { type: Object, required: true },
  showGroup: { type: Boolean, default: true },
})
const status = computed(() => HANGOUT_STATUS[props.hangout.status] ?? HANGOUT_STATUS.draft)
const to = computed(() =>
  props.hangout.status === 'finalized' ? `/hangouts/${props.hangout.id}/confirmed` : `/hangouts/${props.hangout.id}`,
)
</script>

<template>
  <RouterLink
    :to="to"
    class="group flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-lift"
  >
    <GroupAvatar v-if="showGroup && hangout.group" :group="hangout.group" :size="46" />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="truncate text-base font-bold">{{ hangout.title }}</h3>
        <StatusBadge :tone="status.tone">{{ status.label }}</StatusBadge>
      </div>
      <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span v-if="showGroup && hangout.group" class="truncate">{{ hangout.group.name }}</span>
        <span v-if="hangout.scheduled_for" class="flex items-center gap-1"><CalendarClock :size="14" aria-hidden="true" />{{ dateTime(hangout.scheduled_for) }}</span>
        <span v-if="hangout.selected_venue?.name" class="flex items-center gap-1 truncate"><MapPin :size="14" aria-hidden="true" />{{ hangout.selected_venue.name }}</span>
        <span v-else-if="!hangout.scheduled_for" class="text-muted">Updated {{ timeAgo(hangout.updated_at) }}</span>
      </p>
    </div>
    <ChevronRight :size="18" class="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  </RouterLink>
</template>
