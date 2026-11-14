<script setup>
import { CircleCheck, CircleDashed } from 'lucide-vue-next'
import { config, isSupabaseConfigured, isMapsConfigured } from '@/services/config'

const checks = [
  { label: 'Supabase project', ok: isSupabaseConfigured, vars: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] },
  { label: 'Google Maps browser key', ok: isMapsConfigured, vars: ['VITE_GOOGLE_MAPS_API_KEY'] },
  {
    label: 'Google Map ID (optional)',
    ok: config.mapsMapId !== 'DEMO_MAP_ID',
    vars: ['VITE_GOOGLE_MAPS_MAP_ID'],
    optional: true,
  },
]

const steps = [
  {
    title: '1. Create a Supabase project',
    body: 'Copy the project URL and anon key from Project Settings → API into .env (see .env.example). Then link the project and push the database: `npx supabase link --project-ref <ref>` and `npx supabase db push`.',
  },
  {
    title: '2. Configure authentication',
    body: 'Authentication → URL Configuration: set the Site URL to your app URL and add `<app>/home` and `<app>/reset-password` as redirect URLs. For Google sign-in, enable the Google provider with an OAuth client from Google Cloud.',
  },
  {
    title: '3. Enable Google Maps Platform APIs',
    body: 'In Google Cloud, enable Maps JavaScript API, Places API (New), Routes API and (optionally) Geocoding API. Create two keys: a browser key restricted by HTTP referrer (Maps JavaScript, Places (New), Geocoding) and a server key restricted to Places API (New) and Routes API.',
  },
  {
    title: '4. Deploy the Edge Functions',
    body: 'Set secrets with `npx supabase secrets set GOOGLE_MAPS_SERVER_KEY=... ALLOWED_ORIGINS=https://your-app` and deploy with `npx supabase functions deploy compute-meetup` and `npx supabase functions deploy venue-routes`.',
  },
  {
    title: '5. Restart or redeploy the front end',
    body: 'Vite reads VITE_ variables at build time, so restart `npm run dev` or redeploy on Vercel after changing them.',
  },
]
</script>

<template>
  <div class="page max-w-3xl py-12 sm:py-16">
    <p class="eyebrow">Setup</p>
    <h1 class="mt-2 text-3xl font-extrabold sm:text-4xl">Connect Meetzy to its services</h1>
    <p class="mt-3 text-lg text-ink-soft">
      Meetzy runs on Supabase (accounts, groups, realtime voting) and Google Maps Platform (maps, places, travel times).
      Until they're configured, the app shows this honest status instead of fake data.
    </p>

    <ul class="mt-8 divide-y divide-line rounded-3xl border border-line bg-surface">
      <li v-for="c in checks" :key="c.label" class="flex items-start gap-3 p-4 sm:p-5">
        <CircleCheck v-if="c.ok" :size="22" class="mt-0.5 shrink-0 text-mint-600" aria-hidden="true" />
        <CircleDashed v-else :size="22" class="mt-0.5 shrink-0" :class="c.optional ? 'text-muted' : 'text-sun-500'" aria-hidden="true" />
        <div class="min-w-0">
          <p class="font-semibold">
            {{ c.label }}
            <span class="ml-1 text-sm font-medium" :class="c.ok ? 'text-accent-ink' : 'text-muted'">{{ c.ok ? 'connected' : c.optional ? 'using DEMO_MAP_ID' : 'missing' }}</span>
          </p>
          <p class="mt-1 flex flex-wrap gap-1.5">
            <code v-for="name in c.vars" :key="name" class="rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-semibold">{{ name }}</code>
          </p>
        </div>
      </li>
    </ul>

    <ol class="mt-10 space-y-6">
      <li v-for="s in steps" :key="s.title">
        <h2 class="text-lg font-bold">{{ s.title }}</h2>
        <p class="mt-1.5 text-ink-soft">{{ s.body }}</p>
      </li>
    </ol>
    <p class="mt-10 text-sm text-muted">The full guide, including RLS, realtime and scheduled cleanup, is in the project README.</p>
  </div>
</template>
