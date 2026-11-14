<script setup>
import { computed, onMounted } from 'vue'
import { Plus, Link2, House, UsersRound, CalendarHeart, Check, ArrowRight } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import HangoutCard from '@/components/hangouts/HangoutCard.vue'
import GroupCard from '@/components/groups/GroupCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'
import { firstName } from '@/utils/format'
import { isOpenStatus } from '@/utils/domain'

const auth = useAuthStore()
const groups = useGroupsStore()

onMounted(() => {
  groups.load({ silent: groups.loaded })
  auth.loadLocations().catch(() => {})
})

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})
const active = computed(() => groups.hangouts.filter((h) => isOpenStatus(h.status)))
const upcoming = computed(() =>
  groups.hangouts
    .filter((h) => h.status === 'finalized' && (!h.scheduled_for || new Date(h.scheduled_for) > Date.now() - 6 * 3600e3))
    .slice(0, 4),
)

const checklist = computed(() => [
  { done: auth.locations.length > 0, label: 'Save your home location', to: '/profile', icon: House },
  { done: groups.groups.length > 0, label: 'Create or join a group', to: '/groups/new', icon: UsersRound },
  { done: groups.hangouts.length > 0, label: 'Plan your first hangout', to: groups.groups[0] ? `/groups/${groups.groups[0].id}/hangouts/new` : '/groups/new', icon: CalendarHeart },
])
const showChecklist = computed(() => groups.loaded && auth.locationsLoaded && checklist.value.some((c) => !c.done))
</script>

<template>
  <div class="space-y-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold text-muted">{{ greeting }}</p>
        <h1 class="mt-1 text-3xl font-extrabold">Hey {{ firstName(auth.displayName) }} 👋</h1>
        <p class="mt-1 text-ink-soft">Where are we meeting next?</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="secondary" :icon="Link2" to="/groups/join">Join group</BaseButton>
        <BaseButton :icon="Plus" :to="groups.groups[0] ? `/groups/${groups.groups[0].id}/hangouts/new` : '/groups/new'">New hangout</BaseButton>
      </div>
    </header>

    <ErrorState v-if="groups.error && !groups.loaded" :error="groups.error" @retry="groups.load()" />

    <template v-else>
      <section v-if="showChecklist" class="card card-pad">
        <h2 class="text-lg font-bold">Get set up in a minute</h2>
        <ol class="mt-4 grid gap-2 sm:grid-cols-3">
          <li v-for="c in checklist" :key="c.label">
            <RouterLink
              :to="c.to"
              class="flex h-full items-center gap-3 rounded-2xl border p-3.5 text-sm font-semibold transition-colors"
              :class="c.done ? 'border-mint-300 bg-mint-50 text-mint-800 dark:border-mint-800 dark:bg-mint-900/30 dark:text-mint-200' : 'border-line hover:border-line-strong hover:bg-surface-2'"
            >
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" :class="c.done ? 'bg-mint-400 text-navy-900' : 'bg-surface-2 text-ink-soft'">
                <Check v-if="c.done" :size="17" stroke-width="3" aria-hidden="true" />
                <component :is="c.icon" v-else :size="17" aria-hidden="true" />
              </span>
              <span :class="c.done && 'line-through decoration-2 opacity-80'">{{ c.label }}</span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold">In progress</h2>
        </div>
        <div v-if="groups.loading && !groups.loaded" class="space-y-3">
          <SkeletonBlock v-for="n in 2" :key="n" height="5rem" rounded="rounded-3xl" />
        </div>
        <div v-else-if="active.length" class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HangoutCard v-for="h in active" :key="h.id" :hangout="h" />
        </div>
        <div v-else class="card">
          <EmptyState :icon="CalendarHeart" title="No plans in motion" description="Start a hangout and Meetzy will help your group pick a place that's fair for everyone." compact>
            <BaseButton :icon="Plus" :to="groups.groups[0] ? `/groups/${groups.groups[0].id}/hangouts/new` : '/groups/new'">Plan a hangout</BaseButton>
          </EmptyState>
        </div>
      </section>

      <section v-if="upcoming.length">
        <h2 class="mb-3 text-lg font-bold">Locked in</h2>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HangoutCard v-for="h in upcoming" :key="h.id" :hangout="h" />
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold">Your groups</h2>
          <RouterLink v-if="groups.groups.length" to="/groups" class="link flex items-center gap-1 text-sm">All groups <ArrowRight :size="15" aria-hidden="true" /></RouterLink>
        </div>
        <div v-if="groups.loading && !groups.loaded" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonBlock v-for="n in 3" :key="n" height="9rem" rounded="rounded-3xl" />
        </div>
        <div v-else-if="groups.groups.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <GroupCard v-for="g in groups.groups.slice(0, 6)" :key="g.id" :group="g" />
        </div>
        <div v-else class="card">
          <EmptyState :icon="UsersRound" title="No groups yet" description="Create a group for your friends, then share one invite link." compact tone="lavender">
            <BaseButton :icon="Plus" to="/groups/new">Create a group</BaseButton>
            <BaseButton variant="secondary" :icon="Link2" to="/groups/join">Join with a code</BaseButton>
          </EmptyState>
        </div>
      </section>
    </template>
  </div>
</template>
