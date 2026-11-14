<script setup>
import AppLogo from '@/components/common/AppLogo.vue'
import ThemeToggle from '@/components/layout/ThemeToggle.vue'
import MeetupIllustration from '@/components/maps/MeetupIllustration.vue'
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
    <div class="flex flex-col">
      <header class="flex h-16 items-center justify-between px-5 sm:px-8">
        <RouterLink to="/" class="rounded-xl" aria-label="Meetzy home"><AppLogo :size="28" /></RouterLink>
        <ThemeToggle />
      </header>
      <main id="main" class="flex flex-1 items-start justify-center px-5 pt-6 pb-12 sm:items-center sm:px-8 sm:pt-0">
        <div class="w-full max-w-[26rem] animate-fade-up">
          <slot />
        </div>
      </main>
    </div>
    <aside
      class="relative hidden overflow-hidden bg-navy-900 lg:flex lg:flex-col lg:justify-between lg:p-12"
      aria-hidden="true"
    >
      <div class="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-mint-400/15 blur-3xl" />
      <p class="relative max-w-sm font-display text-3xl leading-tight font-extrabold text-white">
        Bring your friends together. We'll find the perfect place in between.
      </p>
      <div class="relative mx-auto w-full max-w-lg">
        <MeetupIllustration variant="dark" />
      </div>
      <p class="relative text-sm text-navy-300">Real travel times from Google Maps, fair for everyone.</p>
    </aside>
  </div>
</template>
