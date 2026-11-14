<script setup>
import { useRouter } from 'vue-router'
import { BellOff, CheckCheck, Trash2, Bell, Vote, PartyPopper, UserPlus, CalendarPlus, Crown, CircleX } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { timeAgo } from '@/utils/format'

const notifications = useNotificationsStore()
const ui = useUiStore()
const router = useRouter()

const ICONS = {
  hangout_created: CalendarPlus,
  voting_open: Vote,
  hangout_finalized: PartyPopper,
  member_joined: UserPlus,
  admin_transferred: Crown,
  member_removed: CircleX,
  hangout_cancelled: CircleX,
}

async function openItem(n) {
  notifications.markRead(n.id).catch(() => {})
  if (n.link) router.push(n.link)
}
async function run(fn) {
  try {
    await fn()
  } catch (e) {
    ui.error(errorMessage(e))
  }
}
</script>

<template>
  <div>
    <PageHeader title="Notifications" subtitle="Updates from your groups and hangouts, live.">
      <template #actions>
        <BaseButton v-if="notifications.unreadCount" variant="secondary" size="sm" :icon="CheckCheck" @click="run(notifications.markAllRead)">Mark all read</BaseButton>
      </template>
    </PageHeader>

    <div v-if="!notifications.loaded" class="space-y-2">
      <SkeletonBlock v-for="n in 4" :key="n" height="4.25rem" rounded="rounded-2xl" />
    </div>
    <div v-else-if="!notifications.items.length" class="card">
      <EmptyState :icon="BellOff" title="All quiet" description="You'll see new hangouts, votes and final plans from your groups here." compact />
    </div>
    <ul v-else class="card divide-y divide-line overflow-hidden">
      <li v-for="n in notifications.items" :key="n.id" class="group relative flex items-start gap-3 p-4" :class="!n.read_at && 'bg-mint-50/60 dark:bg-mint-900/15'">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-soft">
          <component :is="ICONS[n.type] ?? Bell" :size="19" aria-hidden="true" />
        </span>
        <button type="button" class="min-w-0 flex-1 text-left after:absolute after:inset-0" @click="openItem(n)">
          <p class="font-semibold" :class="n.read_at ? 'text-ink-soft' : 'text-ink'">{{ n.title }}</p>
          <p v-if="n.body" class="mt-0.5 text-sm text-ink-soft">{{ n.body }}</p>
          <p class="mt-1 text-xs text-muted">{{ timeAgo(n.created_at) }}</p>
        </button>
        <span v-if="!n.read_at" class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-mint-500" aria-label="Unread" />
        <button
          type="button"
          class="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted opacity-100 hover:bg-surface-2 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          aria-label="Delete notification"
          @click="run(() => notifications.remove(n.id))"
        >
          <Trash2 :size="16" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>
