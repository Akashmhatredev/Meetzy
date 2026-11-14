<script setup>
import { computed } from 'vue'
import { Crown } from 'lucide-vue-next'
import GroupAvatar from './GroupAvatar.vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import { useAuthStore } from '@/stores/auth'
import { plural } from '@/utils/format'

const props = defineProps({ group: { type: Object, required: true } })
const auth = useAuthStore()

const people = computed(() =>
  (props.group.members ?? []).map((m) => ({ userId: m.user_id, name: m.profile?.full_name ?? 'Member', avatarUrl: m.profile?.avatar_url })),
)
const isAdmin = computed(() => props.group.members?.some((m) => m.user_id === auth.userId && m.role === 'admin'))
const open = computed(() => (props.group.hangouts ?? []).filter((h) => !['finalized', 'cancelled'].includes(h.status)).length)
</script>

<template>
  <RouterLink
    :to="`/groups/${group.id}`"
    class="flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-soft transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-lift"
  >
    <div class="flex items-start gap-3">
      <GroupAvatar :group="group" :size="52" />
      <div class="min-w-0 flex-1">
        <h3 class="flex items-center gap-1.5 truncate text-lg font-bold">
          <span class="truncate">{{ group.name }}</span>
          <Crown v-if="isAdmin" :size="15" class="shrink-0 text-sun-500" aria-label="You're an admin" />
        </h3>
        <p class="text-sm text-muted">{{ plural(people.length, 'member') }}</p>
      </div>
    </div>
    <p v-if="group.description" class="mt-3 line-clamp-2 text-sm text-ink-soft">{{ group.description }}</p>
    <div class="mt-auto flex items-center justify-between gap-3 pt-5">
      <AvatarStack :people="people" :size="28" />
      <span
        class="rounded-full px-2.5 py-1 text-xs font-semibold"
        :class="open ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted'"
        >{{ open ? `${plural(open, 'open plan')}` : 'No open plans' }}</span
      >
    </div>
  </RouterLink>
</template>
