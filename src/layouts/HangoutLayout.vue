<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw, CalendarClock, ChevronLeft } from 'lucide-vue-next'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import GroupAvatar from '@/components/groups/GroupAvatar.vue'
import HangoutStepper from '@/components/hangouts/HangoutStepper.vue'
import { useHangoutStore } from '@/stores/hangout'
import { HANGOUT_STATUS } from '@/utils/domain'
import { dateTime } from '@/utils/format'

const route = useRoute()
const h = useHangoutStore()

watch(
  () => route.params.hangoutId,
  (id) => id && h.open(String(id)),
  { immediate: true },
)
onBeforeUnmount(() => h.close())

const status = computed(() => HANGOUT_STATUS[h.hangout?.status] ?? HANGOUT_STATUS.draft)
const onDashboard = computed(() => route.name === 'hangout')
</script>

<template>
  <ErrorState v-if="h.error" :error="h.error" back-to="/home" back-label="Back home" @retry="h.open(String(route.params.hangoutId))" />
  <div v-else-if="h.loading || !h.hangout" class="space-y-4">
    <SkeletonBlock height="1rem" width="8rem" />
    <SkeletonBlock height="2.5rem" width="60%" />
    <SkeletonBlock height="0.5rem" />
    <SkeletonBlock height="16rem" rounded="rounded-3xl" />
  </div>
  <div v-else>
    <header class="mb-6">
      <div class="mb-3 flex items-center gap-2 text-sm">
        <RouterLink
          v-if="!onDashboard"
          :to="{ name: 'hangout', params: { hangoutId: h.hangoutId } }"
          class="flex items-center gap-1 font-semibold text-ink-soft hover:text-ink"
          ><ChevronLeft :size="16" aria-hidden="true" />Overview</RouterLink
        >
        <RouterLink v-else :to="`/groups/${h.hangout.group_id}`" class="flex min-w-0 items-center gap-2 font-semibold text-ink-soft hover:text-ink">
          <GroupAvatar v-if="h.hangout.group" :group="h.hangout.group" :size="22" />
          <span class="truncate">{{ h.hangout.group?.name }}</span>
        </RouterLink>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 class="min-w-0 text-2xl font-extrabold sm:text-3xl">{{ h.hangout.title }}</h1>
        <StatusBadge :tone="status.tone">{{ status.label }}</StatusBadge>
      </div>
      <p v-if="h.hangout.scheduled_for" class="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
        <CalendarClock :size="15" aria-hidden="true" /> {{ dateTime(h.hangout.scheduled_for) }}
      </p>
      <div class="mt-5">
        <HangoutStepper />
      </div>
      <RouterLink
        v-if="h.isStale && h.isOpen && route.name !== 'hangout-meeting-point'"
        :to="{ name: 'hangout-meeting-point', params: { hangoutId: h.hangoutId } }"
        class="mt-4 flex items-center gap-3 rounded-2xl border border-sun-200 bg-warn-soft px-4 py-3 text-sm font-medium text-warn dark:border-sun-700/50"
      >
        <RefreshCw :size="17" class="shrink-0" aria-hidden="true" />
        <span class="flex-1">Locations, activities or settings changed since the last calculation. Recalculate to refresh venues and travel times.</span>
        <span class="font-bold underline underline-offset-4">Recalculate</span>
      </RouterLink>
    </header>
    <RouterView />
  </div>
</template>
