<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Crown, UserMinus, MapPin, MapPinOff, LogOut } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import DropdownMenu from '@/components/common/DropdownMenu.vue'
import InvitePanel from '@/components/groups/InvitePanel.vue'
import GroupSharingToggle from '@/components/groups/GroupSharingToggle.vue'
import { useGroupStore } from '@/stores/group'
import { useAuthStore } from '@/stores/auth'
import { useGroupActions } from '@/composables/useGroupActions'
import { timeAgo } from '@/utils/format'

const route = useRoute()
const group = useGroupStore()
const auth = useAuthStore()
const actions = useGroupActions()
const autoInvite = computed(() => route.query.invite === '1')

const menuFor = (m) => [
  ...(m.role !== 'admin' ? [{ label: 'Make admin', icon: Crown, onSelect: () => actions.makeAdmin(m) }] : []),
  { label: 'Remove from group', icon: UserMinus, danger: true, onSelect: () => actions.kick(m) },
]
</script>

<template>
  <div>
    <PageHeader :title="`${group.group.name} members`" :back="`/groups/${group.groupId}`" :back-label="group.group.name" subtitle="Who's in, who's admin, and who has a default place shared.">
      <template #actions>
        <BaseButton variant="secondary" :icon="LogOut" @click="actions.leave">Leave group</BaseButton>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section class="card overflow-hidden">
        <ul class="divide-y divide-line">
          <li v-for="m in group.members" :key="m.id" class="flex items-center gap-3 p-4">
            <UserAvatar :name="m.profile?.full_name" :src="m.profile?.avatar_url" :size="44" />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                <span class="truncate">{{ m.profile?.full_name || 'Member' }}</span>
                <span v-if="m.user_id === auth.userId" class="text-xs font-semibold text-muted">(you)</span>
                <span v-if="m.role === 'admin'" class="flex items-center gap-1 rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-bold text-sun-700 dark:bg-sun-700/30 dark:text-sun-200">
                  <Crown :size="12" aria-hidden="true" /> Admin
                </span>
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm" :class="m.location_sharing_enabled ? 'text-accent-ink' : 'text-muted'">
                <component :is="m.location_sharing_enabled ? MapPin : MapPinOff" :size="14" aria-hidden="true" />
                {{ m.location_sharing_enabled ? 'Shares a default place' : 'Shares per hangout' }}
                <span class="text-muted">· joined {{ timeAgo(m.joined_at) }}</span>
              </p>
            </div>
            <DropdownMenu v-if="group.isAdmin && m.user_id !== auth.userId" :items="menuFor(m)" :label="`Actions for ${m.profile?.full_name || 'member'}`" />
          </li>
        </ul>
      </section>
      <div class="space-y-5">
        <InvitePanel :auto-create="autoInvite" />
        <section class="card card-pad">
          <h2 class="mb-3 text-lg font-bold">Your sharing</h2>
          <GroupSharingToggle />
        </section>
      </div>
    </div>
  </div>
</template>
