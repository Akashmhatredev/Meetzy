<script setup>
import { onMounted } from 'vue'
import { Plus, Link2, UsersRound } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import GroupCard from '@/components/groups/GroupCard.vue'
import { useGroupsStore } from '@/stores/groups'

const groups = useGroupsStore()
onMounted(() => groups.load({ silent: groups.loaded }))
</script>

<template>
  <div>
    <PageHeader title="Your groups" subtitle="Reuse a group for every plan. Invite friends with one link.">
      <template #actions>
        <BaseButton variant="secondary" :icon="Link2" to="/groups/join">Join</BaseButton>
        <BaseButton :icon="Plus" to="/groups/new">New group</BaseButton>
      </template>
    </PageHeader>
    <ErrorState v-if="groups.error && !groups.loaded" :error="groups.error" @retry="groups.load()" />
    <div v-else-if="groups.loading && !groups.loaded" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SkeletonBlock v-for="n in 6" :key="n" height="10rem" rounded="rounded-3xl" />
    </div>
    <div v-else-if="groups.groups.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <GroupCard v-for="g in groups.groups" :key="g.id" :group="g" />
    </div>
    <div v-else class="card">
      <EmptyState :icon="UsersRound" title="No groups yet" description="Office Friends, College Gang, Weekend Squad… make one and invite everyone with a link." tone="lavender">
        <BaseButton :icon="Plus" to="/groups/new">Create a group</BaseButton>
        <BaseButton variant="secondary" :icon="Link2" to="/groups/join">Join with a code</BaseButton>
      </EmptyState>
    </div>
  </div>
</template>
