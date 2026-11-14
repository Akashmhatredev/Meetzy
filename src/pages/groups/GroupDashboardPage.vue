<script setup>
import { computed, ref } from 'vue'
import { Plus, UserPlus, Pencil, LogOut, Trash2, UsersRound, CalendarHeart, MapPin, ChevronRight } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import DropdownMenu from '@/components/common/DropdownMenu.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import GroupAvatar from '@/components/groups/GroupAvatar.vue'
import GroupSharingToggle from '@/components/groups/GroupSharingToggle.vue'
import EditGroupDialog from '@/components/groups/EditGroupDialog.vue'
import HangoutCard from '@/components/hangouts/HangoutCard.vue'
import { useGroupStore } from '@/stores/group'
import { useGroupActions } from '@/composables/useGroupActions'
import { isOpenStatus } from '@/utils/domain'
import { plural } from '@/utils/format'

const group = useGroupStore()
const actions = useGroupActions()
const editOpen = ref(false)

const open = computed(() => group.hangouts.filter((h) => isOpenStatus(h.status)))
const past = computed(() => group.hangouts.filter((h) => !isOpenStatus(h.status)))
const menu = computed(() => [
  ...(group.isAdmin ? [{ label: 'Edit group', icon: Pencil, onSelect: () => (editOpen.value = true) }] : []),
  { label: 'Members & invites', icon: UsersRound, to: `/groups/${group.groupId}/members` },
  { label: 'Leave group', icon: LogOut, danger: true, onSelect: actions.leave },
  ...(group.isAdmin ? [{ label: 'Delete group', icon: Trash2, danger: true, onSelect: actions.remove }] : []),
])
</script>

<template>
  <div class="space-y-6">
    <RouterLink to="/groups" class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">← Groups</RouterLink>
    <header class="card card-pad flex flex-col gap-5 sm:flex-row sm:items-center">
      <GroupAvatar :group="group.group" :size="72" />
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-extrabold sm:text-3xl">{{ group.group.name }}</h1>
        <p v-if="group.group.description" class="mt-1 text-ink-soft">{{ group.group.description }}</p>
        <p class="mt-2 text-sm text-muted">{{ plural(group.members.length, 'member') }} · {{ group.sharingCount }} sharing a default place</p>
      </div>
      <div class="flex items-center gap-2">
        <BaseButton variant="secondary" :icon="UserPlus" :to="`/groups/${group.groupId}/members?invite=1`">Invite</BaseButton>
        <BaseButton :icon="Plus" :to="`/groups/${group.groupId}/hangouts/new`">New hangout</BaseButton>
        <DropdownMenu :items="menu" label="Group actions" />
      </div>
    </header>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div class="space-y-6">
        <section>
          <h2 class="mb-3 text-lg font-bold">Open plans</h2>
          <div v-if="open.length" class="space-y-3">
            <HangoutCard v-for="h in open" :key="h.id" :hangout="h" :show-group="false" />
          </div>
          <div v-else class="card">
            <EmptyState :icon="CalendarHeart" title="Nothing planned yet" description="Start a hangout. Everyone shares a location and picks activities, and Meetzy finds the fairest spot." compact>
              <BaseButton :icon="Plus" :to="`/groups/${group.groupId}/hangouts/new`">Plan a hangout</BaseButton>
            </EmptyState>
          </div>
        </section>
        <section v-if="past.length">
          <h2 class="mb-3 text-lg font-bold">Past plans</h2>
          <div class="space-y-3">
            <HangoutCard v-for="h in past" :key="h.id" :hangout="h" :show-group="false" />
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section class="card card-pad">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-lg font-bold">Members</h2>
            <RouterLink :to="`/groups/${group.groupId}/members`" class="link flex items-center text-sm">Manage <ChevronRight :size="16" aria-hidden="true" /></RouterLink>
          </div>
          <ul class="space-y-2.5">
            <li v-for="m in group.members.slice(0, 6)" :key="m.id" class="flex items-center gap-3">
              <UserAvatar :name="m.profile?.full_name" :src="m.profile?.avatar_url" :size="36" />
              <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ m.profile?.full_name || 'Member' }}</span>
              <span v-if="m.location_sharing_enabled" class="flex items-center gap-1 text-xs font-semibold text-accent-ink"><MapPin :size="13" aria-hidden="true" /> Sharing</span>
            </li>
          </ul>
          <p v-if="group.members.length > 6" class="mt-3 text-sm text-muted">+{{ group.members.length - 6 }} more</p>
        </section>
        <section class="card card-pad">
          <h2 class="mb-3 text-lg font-bold">Location sharing</h2>
          <GroupSharingToggle />
        </section>
      </aside>
    </div>
    <EditGroupDialog v-model:open="editOpen" />
  </div>
</template>
