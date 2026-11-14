<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { useGroupStore } from '@/stores/group'

const route = useRoute()
const group = useGroupStore()

watch(
  () => route.params.groupId,
  (id) => id && group.open(String(id)),
  { immediate: true },
)
onBeforeUnmount(() => group.close())
</script>

<template>
  <ErrorState v-if="group.error" :error="group.error" back-to="/groups" back-label="Your groups" @retry="group.open(String(route.params.groupId))" />
  <div v-else-if="group.loading || !group.group" class="space-y-4">
    <SkeletonBlock height="5rem" rounded="rounded-3xl" />
    <SkeletonBlock height="12rem" rounded="rounded-3xl" />
  </div>
  <RouterView v-else />
</template>
