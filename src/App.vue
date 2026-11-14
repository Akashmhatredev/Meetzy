<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import PublicLayout from '@/layouts/PublicLayout.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import ConfirmHost from '@/components/common/ConfirmHost.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { useGroupsStore } from '@/stores/groups'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const auth = useAuthStore()
const notifications = useNotificationsStore()
const groups = useGroupsStore()
useUiStore() // applies the theme

const LAYOUTS = { public: PublicLayout, auth: AuthLayout, app: AppLayout }
const layout = computed(() => {
  const name = [...route.matched].reverse().find((r) => r.meta.layout)?.meta.layout
  return LAYOUTS[name] ?? null
})

// Live in-app notifications while signed in; clear everything on sign-out.
watch(
  () => auth.userId,
  (userId) => {
    if (userId) notifications.start(userId)
    else {
      notifications.stopListening()
      groups.reset()
    }
  },
  { immediate: true },
)
</script>

<template>
  <a
    href="#main"
    class="sr-only z-[100] rounded-xl bg-navy-900 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >Skip to content</a
  >
  <component :is="layout" v-if="layout">
    <RouterView />
  </component>
  <RouterView v-else />
  <ToastHost />
  <ConfirmHost />
</template>
