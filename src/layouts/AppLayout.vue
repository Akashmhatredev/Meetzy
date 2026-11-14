<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { House, UsersRound, Bell, CircleUserRound, Settings, Plus, LogOut } from 'lucide-vue-next'
import AppLogo from '@/components/common/AppLogo.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import DropdownMenu from '@/components/common/DropdownMenu.vue'
import ThemeToggle from '@/components/layout/ThemeToggle.vue'
import QuickPlanDialog from '@/components/hangouts/QuickPlanDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const auth = useAuthStore()
const notifications = useNotificationsStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const planOpen = ref(false)

const nav = [
  { label: 'Home', to: '/home', icon: House, match: ['/home'] },
  { label: 'Groups', to: '/groups', icon: UsersRound, match: ['/groups', '/hangouts'] },
  { label: 'Notifications', short: 'Alerts', to: '/notifications', icon: Bell, match: ['/notifications'] },
  { label: 'Profile', to: '/profile', icon: CircleUserRound, match: ['/profile'] },
]
const isActive = (item) => item.match.some((m) => route.path.startsWith(m))
const badge = computed(() => (notifications.unreadCount > 9 ? '9+' : notifications.unreadCount || null))
const wide = computed(() => route.matched.some((r) => r.meta.wide))

async function signOut() {
  try {
    await auth.signOut()
    router.replace('/')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

const accountMenu = [
  { label: 'Profile', icon: CircleUserRound, to: '/profile' },
  { label: 'Settings', icon: Settings, to: '/settings' },
  { label: 'Sign out', icon: LogOut, danger: true, onSelect: signOut },
]
</script>

<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
    <!-- Desktop sidebar -->
    <aside class="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
      <RouterLink to="/home" class="mb-8 self-start rounded-xl px-2" aria-label="Meetzy home"><AppLogo :size="30" /></RouterLink>
      <button
        type="button"
        class="mb-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-on-accent shadow-[inset_0_-2px_0_rgb(16_24_39/0.12)] transition-colors hover:bg-mint-300 active:scale-[0.98]"
        @click="planOpen = true"
      >
        <Plus :size="19" stroke-width="2.5" aria-hidden="true" /> Plan a hangout
      </button>
      <nav class="flex flex-col gap-1" aria-label="Main">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors"
          :class="isActive(item) ? 'bg-accent-soft text-ink' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'"
          :aria-current="isActive(item) ? 'page' : undefined"
        >
          <component :is="item.icon" :size="20" aria-hidden="true" :class="isActive(item) ? 'text-accent-ink' : ''" />
          {{ item.label }}
          <span
            v-if="item.to === '/notifications' && badge"
            class="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white"
            >{{ badge }}</span
          >
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors"
          :class="route.path.startsWith('/settings') ? 'bg-accent-soft text-ink' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'"
          :aria-current="route.path.startsWith('/settings') ? 'page' : undefined"
        >
          <Settings :size="20" aria-hidden="true" /> Settings
        </RouterLink>
      </nav>
      <div class="mt-auto flex items-center gap-2 rounded-2xl border border-line p-2">
        <UserAvatar :name="auth.displayName" :src="auth.profile?.avatar_url" :size="36" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ auth.displayName }}</p>
          <p class="truncate text-xs text-muted">{{ auth.user?.email }}</p>
        </div>
        <DropdownMenu :items="accountMenu" label="Account menu" placement="top" />
      </div>
      <div class="mt-2 flex items-center justify-between px-2 text-xs text-muted">
        <span>Appearance</span>
        <ThemeToggle />
      </div>
    </aside>

    <div class="flex min-h-dvh min-w-0 flex-col">
      <!-- Mobile / tablet top bar -->
      <header class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur-md lg:hidden">
        <RouterLink to="/home" class="rounded-xl" aria-label="Meetzy home"><AppLogo :size="26" /></RouterLink>
        <div class="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu :items="accountMenu" label="Account">
            <template #trigger="{ toggle, open, id }">
              <button
                type="button"
                class="ml-1 rounded-full"
                aria-label="Account menu"
                aria-haspopup="menu"
                :aria-expanded="open"
                :aria-controls="id"
                @click="toggle"
              >
                <UserAvatar :name="auth.displayName" :src="auth.profile?.avatar_url" :size="32" />
              </button>
            </template>
          </DropdownMenu>
        </div>
      </header>

      <main id="main" class="flex-1 pb-28 lg:pb-12">
        <div class="mx-auto w-full px-4 pt-5 sm:px-6 lg:px-10 lg:pt-8" :class="wide ? 'max-w-7xl' : 'max-w-5xl'">
          <slot />
        </div>
      </main>

      <!-- Mobile bottom navigation -->
      <nav
        class="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
        aria-label="Main"
      >
        <div class="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
          <RouterLink
            v-for="item in nav.slice(0, 2)"
            :key="item.to"
            :to="item.to"
            class="flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-semibold"
            :class="isActive(item) ? 'text-accent-ink' : 'text-muted'"
            :aria-current="isActive(item) ? 'page' : undefined"
          >
            <component :is="item.icon" :size="22" aria-hidden="true" />
            {{ item.short ?? item.label }}
          </RouterLink>
          <div class="flex justify-center">
            <button
              type="button"
              class="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-lift ring-4 ring-canvas transition-transform active:scale-95"
              aria-label="Plan a hangout"
              @click="planOpen = true"
            >
              <Plus :size="26" stroke-width="2.5" aria-hidden="true" />
            </button>
          </div>
          <RouterLink
            v-for="item in nav.slice(2)"
            :key="item.to"
            :to="item.to"
            class="relative flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-semibold"
            :class="isActive(item) ? 'text-accent-ink' : 'text-muted'"
            :aria-current="isActive(item) ? 'page' : undefined"
          >
            <component :is="item.icon" :size="22" aria-hidden="true" />
            {{ item.short ?? item.label }}
            <span
              v-if="item.to === '/notifications' && badge"
              class="absolute top-0 left-1/2 ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white"
              >{{ badge }}</span
            >
          </RouterLink>
        </div>
      </nav>
    </div>

    <QuickPlanDialog v-model:open="planOpen" />
  </div>
</template>
