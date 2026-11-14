<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { Menu, X } from 'lucide-vue-next'
import AppLogo from '@/components/common/AppLogo.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import ThemeToggle from '@/components/layout/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const menuOpen = ref(false)
const scrolled = ref(false)

const links = [
  { label: 'How it works', to: { path: '/', hash: '#how-it-works' } },
  { label: 'Fair meeting points', to: { path: '/', hash: '#midpoint' } },
  { label: 'FAQ', to: { path: '/', hash: '#faq' } },
]

const onScroll = () => (scrolled.value = window.scrollY > 8)
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
watch(() => route.fullPath, () => (menuOpen.value = false))
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header
      class="sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-200"
      :class="scrolled || menuOpen ? 'border-b border-line bg-canvas/90 backdrop-blur-md' : 'border-b border-transparent'"
    >
      <div class="page flex h-16 items-center gap-4">
        <RouterLink to="/" class="rounded-xl" aria-label="Meetzy home"><AppLogo :size="30" /></RouterLink>
        <nav class="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          <RouterLink
            v-for="l in links"
            :key="l.label"
            :to="l.to"
            class="rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
            >{{ l.label }}</RouterLink
          >
        </nav>
        <div class="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <div class="hidden items-center gap-1.5 sm:flex">
            <BaseButton v-if="auth.isSignedIn" to="/home" size="sm">Open Meetzy</BaseButton>
            <template v-else>
              <BaseButton to="/login" variant="ghost" size="sm">Sign in</BaseButton>
              <BaseButton to="/register" size="sm">Plan a hangout</BaseButton>
            </template>
          </div>
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-surface-2 md:hidden"
            :aria-expanded="menuOpen"
            aria-controls="mobile-menu"
            :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
            @click="menuOpen = !menuOpen"
          >
            <X v-if="menuOpen" :size="22" aria-hidden="true" />
            <Menu v-else :size="22" aria-hidden="true" />
          </button>
        </div>
      </div>
      <nav v-show="menuOpen" id="mobile-menu" class="page border-t border-line pt-3 pb-5 md:hidden" aria-label="Mobile">
        <RouterLink
          v-for="l in links"
          :key="l.label"
          :to="l.to"
          class="block rounded-xl px-3 py-3 font-semibold text-ink hover:bg-surface-2"
          @click="menuOpen = false"
          >{{ l.label }}</RouterLink
        >
        <div class="mt-3 grid grid-cols-2 gap-2">
          <template v-if="auth.isSignedIn">
            <BaseButton to="/home" class="col-span-2">Open Meetzy</BaseButton>
          </template>
          <template v-else>
            <BaseButton to="/login" variant="secondary">Sign in</BaseButton>
            <BaseButton to="/register">Get started</BaseButton>
          </template>
        </div>
      </nav>
    </header>

    <main id="main" class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-line">
      <div class="page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <AppLogo :size="26" />
          <p class="mt-2 text-sm text-ink-soft">Less planning. More meeting.</p>
        </div>
        <nav class="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft" aria-label="Footer">
          <RouterLink :to="{ path: '/', hash: '#how-it-works' }" class="hover:text-ink">How it works</RouterLink>
          <RouterLink :to="{ path: '/', hash: '#faq' }" class="hover:text-ink">FAQ</RouterLink>
          <RouterLink to="/setup" class="hover:text-ink">Self-host setup</RouterLink>
          <RouterLink to="/login" class="hover:text-ink">Sign in</RouterLink>
        </nav>
      </div>
      <p class="page pb-8 text-xs text-muted">
        Maps, places and travel times are provided by Google Maps Platform. Meetzy never tracks your location in the
        background.
      </p>
    </footer>
  </div>
</template>
