<script setup>
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, ChevronRight, UsersRound, Link2 } from 'lucide-vue-next'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import GroupAvatar from '@/components/groups/GroupAvatar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useGroupsStore } from '@/stores/groups'
import { plural } from '@/utils/format'

const open = defineModel('open', { type: Boolean, default: false })
const groups = useGroupsStore()
const router = useRouter()

watch(open, (value) => {
  if (value && !groups.loaded) groups.load()
})

function pick(group) {
  open.value = false
  router.push({ name: 'hangout-new', params: { groupId: group.id } })
}
function go(path) {
  open.value = false
  router.push(path)
}
</script>

<template>
  <BaseDialog v-model:open="open" title="Plan a hangout" description="Which group is this for?">
    <div v-if="groups.loading && !groups.loaded" class="space-y-2">
      <SkeletonBlock v-for="n in 3" :key="n" height="3.75rem" rounded="rounded-2xl" />
    </div>
    <EmptyState
      v-else-if="!groups.groups.length"
      :icon="UsersRound"
      title="Start with a group"
      description="Hangouts happen inside a group. Create one and invite your friends with a link."
      compact
    >
      <BaseButton :icon="Plus" @click="go('/groups/new')">Create a group</BaseButton>
      <BaseButton variant="secondary" :icon="Link2" @click="go('/groups/join')">Join with a code</BaseButton>
    </EmptyState>
    <ul v-else class="space-y-2">
      <li v-for="g in groups.groups" :key="g.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left transition-colors hover:border-mint-400 hover:bg-mint-50 dark:hover:bg-mint-900/20"
          @click="pick(g)"
        >
          <GroupAvatar :group="g" :size="44" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ g.name }}</span>
            <span class="block text-sm text-muted">{{ plural(g.members?.length ?? 0, 'member') }}</span>
          </span>
          <ChevronRight :size="18" class="text-muted" aria-hidden="true" />
        </button>
      </li>
      <li class="pt-2">
        <BaseButton variant="ghost" block :icon="Plus" @click="go('/groups/new')">New group</BaseButton>
      </li>
    </ul>
  </BaseDialog>
</template>
