<script setup>
import { Wrench } from 'lucide-vue-next'
import { missingConfig } from '@/services/config'

defineProps({
  service: { type: String, default: 'supabase' }, // supabase | maps
  compact: { type: Boolean, default: false },
})
const missing = missingConfig()
</script>

<template>
  <div class="rounded-3xl border border-dashed border-line-strong bg-surface-2/60 text-left" :class="compact ? 'p-4' : 'p-6'">
    <div class="flex items-start gap-3">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sun-100 text-sun-700 dark:bg-sun-700/30 dark:text-sun-200">
        <Wrench :size="20" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <h3 class="text-base font-bold">
          {{ service === 'maps' ? 'Google Maps is not configured' : 'Meetzy needs its backend configured' }}
        </h3>
        <p class="mt-1 text-sm text-ink-soft">
          <template v-if="service === 'maps'">
            Add a browser key with Maps JavaScript API and Places API (New) enabled as
            <code class="rounded bg-surface px-1 py-0.5 text-xs font-semibold">VITE_GOOGLE_MAPS_API_KEY</code>, then
            restart the app. Nothing on this screen is simulated.
          </template>
          <template v-else>
            This deployment has no Supabase project connected, so sign-in, groups and hangouts are unavailable.
            Nothing here is faked.
          </template>
        </p>
        <ul v-if="missing.length && !compact" class="mt-3 flex flex-wrap gap-1.5">
          <li v-for="name in missing" :key="name">
            <code class="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold">{{ name }}</code>
          </li>
        </ul>
        <RouterLink v-if="!compact" to="/setup" class="link mt-3 inline-block text-sm">Open the setup guide</RouterLink>
      </div>
    </div>
  </div>
</template>
