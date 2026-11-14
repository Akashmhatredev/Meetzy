<script setup>
import { computed, ref } from 'vue'
import {
  ArrowRight,
  Link2,
  ShieldCheck,
  MapPin,
  Vote,
  Navigation,
  Coffee,
  Clapperboard,
  Flag,
  Trees,
  ShoppingBag,
  Gamepad2,
  Check,
  Plus,
  Lock,
  Scale,
  Zap,
  Users,
  ChevronDown,
} from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import MeetupIllustration from '@/components/maps/MeetupIllustration.vue'
import AppLogo from '@/components/common/AppLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()
const primaryCta = computed(() => (auth.isSignedIn ? '/home' : '/register'))

const steps = [
  { icon: Users, title: 'Create your group', text: 'Start a group and share one invite link. Friends join in a tap.' },
  { icon: MapPin, title: 'Share locations', text: 'Each friend shares home or current location for this plan only.' },
  { icon: Vote, title: 'Pick & vote', text: 'Choose what you feel like doing and vote on activities together.' },
  { icon: Navigation, title: 'Meet in the middle', text: 'Meetzy compares real travel times and suggests fair venues.' },
]

// Sample numbers for the explainer (minutes), the same example as the product spec.
const sample = [
  { name: 'Venue A', times: [18, 22, 25, 20] },
  { name: 'Venue B', times: [28, 15, 19, 32] },
  { name: 'Venue C', times: [21, 24, 20, 23] },
]
const friendsDemo = [
  { name: 'Maya', color: '#7C5CE6' },
  { name: 'Arjun', color: '#2F7FD8' },
  { name: 'Sara', color: '#E07A16' },
  { name: 'Kabir', color: '#D9466F' },
]
const strategies = [
  { value: 'fair', label: 'Fair', icon: Scale, text: 'Keeps the longest trip as short as possible, so nobody gets stuck with a marathon.' },
  { value: 'balanced', label: 'Balanced', icon: Users, text: 'Lowest average travel time across the group.' },
  { value: 'fastest', label: 'Fastest', icon: Zap, text: 'Lowest total minutes spent travelling, all trips added up.' },
]
const strategy = ref('fair')
const scored = computed(() =>
  sample.map((v) => {
    const total = v.times.reduce((a, b) => a + b, 0)
    return { ...v, total, avg: total / v.times.length, max: Math.max(...v.times) }
  }),
)
const winner = computed(() => {
  const key = { fair: 'max', balanced: 'avg', fastest: 'total' }[strategy.value]
  return [...scored.value].sort((a, b) => a[key] - b[key] || a.avg - b.avg)[0].name
})

const activities = [
  { icon: Coffee, label: 'Cafe', votes: 4 },
  { icon: Clapperboard, label: 'Movies', votes: 3 },
  { icon: Flag, label: 'Go-karting', votes: 2 },
  { icon: Trees, label: 'Parks', votes: 1 },
  { icon: Gamepad2, label: 'Gaming', votes: 1 },
  { icon: ShoppingBag, label: 'Shopping', votes: 0 },
]

const faqs = [
  {
    q: 'Does Meetzy track my location?',
    a: 'No. Meetzy never tracks you in the background. You choose a location for each hangout (a saved place, your current position with permission, or a pin you drop) and you can stop sharing at any time. Only members of that group can see it.',
  },
  {
    q: 'How is the meeting point calculated?',
    a: 'Meetzy starts from the geographic centre of everyone who shared a location, tests several candidate areas around it with real Google travel times, then searches for venues that match your activities and ranks them by actual minutes on the road, not straight-line distance.',
  },
  {
    q: "What's the difference between Fair, Balanced and Fastest?",
    a: 'Fair minimises the longest individual trip. Balanced minimises the average trip. Fastest minimises the total time the whole group spends travelling. You can switch strategies and the venue ranking updates instantly.',
  },
  {
    q: 'Which travel modes are supported?',
    a: 'Driving, two-wheeler, public transport, walking and cycling, wherever Google Maps supports them. If a mode isn\'t available for your area, Meetzy tells you and suggests another one instead of guessing.',
  },
  {
    q: 'Are the venues and ratings real?',
    a: 'Yes. Venues, ratings, opening hours and photos come straight from Google Places. Meetzy never invents venues, prices or travel times.',
  },
  {
    q: 'Do my friends need to install an app?',
    a: 'No. Meetzy runs in any modern browser on phones, tablets and computers. You can add it to your home screen if you like.',
  },
]
</script>

<template>
  <!-- Hero -->
  <section class="relative overflow-hidden">
    <div class="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-mint-200/40 blur-3xl dark:bg-mint-800/20" aria-hidden="true" />
    <div class="page relative grid items-center gap-10 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-24">
      <div class="animate-fade-up">
        <p class="chip mb-5 !border-mint-300 !bg-mint-50 !text-mint-800 dark:!border-mint-800 dark:!bg-mint-900/40 dark:!text-mint-200">
          <span class="h-1.5 w-1.5 rounded-full bg-mint-500" aria-hidden="true" />
          Less planning. More meeting.
        </p>
        <h1 class="text-[2.6rem] leading-[1.05] font-extrabold sm:text-6xl lg:text-[3.75rem]">
          Your friends are everywhere. Meetzy finds
          <span class="relative whitespace-nowrap">
            <span class="relative z-10">the middle.</span>
            <svg class="absolute -bottom-1.5 left-0 z-0 h-4 w-full text-mint-400" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true">
              <path d="M2 11 C 80 3, 200 3, 298 9" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" />
            </svg>
          </span>
        </h1>
        <p class="mt-6 max-w-xl text-lg text-ink-soft sm:text-xl">
          Pick what you want to do, bring your friends together, and let Meetzy find the perfect place to meet.
        </p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <BaseButton :to="primaryCta" size="lg" :icon-right="ArrowRight">Plan a Hangout</BaseButton>
          <BaseButton :to="{ path: '/', hash: '#how-it-works' }" size="lg" variant="secondary">How It Works</BaseButton>
        </div>
        <ul class="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-soft">
          <li class="flex items-center gap-1.5"><Check :size="16" class="text-mint-600" aria-hidden="true" /> Real Google travel times</li>
          <li class="flex items-center gap-1.5"><Check :size="16" class="text-mint-600" aria-hidden="true" /> Fair for everyone</li>
          <li class="flex items-center gap-1.5"><Check :size="16" class="text-mint-600" aria-hidden="true" /> No background tracking</li>
        </ul>
      </div>
      <div class="relative animate-pop" style="animation-delay: 0.1s">
        <div class="rounded-[2rem] border border-line bg-surface p-2.5 shadow-lift">
          <MeetupIllustration :variant="ui.isDark ? 'dark' : 'light'" />
        </div>
        <div class="absolute -bottom-5 -left-2 hidden rounded-2xl border border-line bg-surface px-4 py-3 shadow-lift sm:block">
          <p class="text-xs font-semibold text-muted">Longest trip</p>
          <p class="font-display text-xl font-extrabold">24 min <span class="text-sm font-semibold text-accent-ink">fairest</span></p>
        </div>
      </div>
    </div>
  </section>

  <!-- How it works -->
  <section id="how-it-works" class="scroll-mt-20 border-y border-line bg-surface py-16 sm:py-20">
    <div class="page">
      <p class="eyebrow">How Meetzy works</p>
      <h2 class="mt-2 max-w-2xl text-3xl font-extrabold sm:text-4xl">From group chat chaos to a plan in about two minutes.</h2>
      <ol class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="(s, i) in steps" :key="s.title" class="relative rounded-3xl border border-line bg-canvas p-5">
          <span class="absolute top-5 right-5 font-display text-sm font-extrabold text-muted">0{{ i + 1 }}</span>
          <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-100 text-mint-700 dark:bg-mint-900/50 dark:text-mint-300">
            <component :is="s.icon" :size="22" aria-hidden="true" />
          </div>
          <h3 class="text-lg font-bold">{{ s.title }}</h3>
          <p class="mt-1.5 text-sm text-ink-soft">{{ s.text }}</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- Create group -->
  <section class="py-16 sm:py-24">
    <div class="page grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div>
        <p class="eyebrow">Create your group</p>
        <h2 class="mt-2 text-3xl font-extrabold sm:text-4xl">One link and everyone's in.</h2>
        <p class="mt-4 text-lg text-ink-soft">
          Office Friends, College Gang, Weekend Squad. Make a group once and reuse it for every plan. Invite links can
          expire, have a use limit, and be revoked by admins at any time.
        </p>
      </div>
      <div class="card card-pad">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-100 text-2xl dark:bg-lavender-700/40" aria-hidden="true">🎉</div>
          <div>
            <p class="font-display text-lg font-bold">Weekend Squad</p>
            <p class="text-sm text-muted">5 members · 2 hangouts</p>
          </div>
        </div>
        <div class="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-canvas p-3">
          <Link2 :size="18" class="shrink-0 text-muted" aria-hidden="true" />
          <span class="truncate font-mono text-sm text-ink-soft">meetzy.app/join/K7QM4TZP</span>
          <span class="ml-auto rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-on-accent">Copy</span>
        </div>
        <p class="mt-3 text-xs text-muted">Expires in 7 days · Admins can revoke</p>
      </div>
    </div>
  </section>

  <!-- Share locations -->
  <section class="pb-16 sm:pb-24">
    <div class="page grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div class="card card-pad order-2 lg:order-1">
        <p class="mb-3 text-sm font-bold">Who's shared a location</p>
        <ul class="space-y-2.5">
          <li v-for="(f, i) in friendsDemo" :key="f.name" class="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2.5">
            <span class="flex h-9 w-9 items-center justify-center rounded-full border-[3px] bg-white font-display text-sm font-extrabold text-navy-900" :style="{ borderColor: f.color }">{{ f.name[0] }}</span>
            <span class="font-semibold">{{ f.name }}</span>
            <span v-if="i < 3" class="ml-auto flex items-center gap-1 text-xs font-semibold text-accent-ink"><Check :size="14" aria-hidden="true" /> {{ ['Home', 'Current location', 'Office'][i] }}</span>
            <span v-else class="ml-auto rounded-full bg-sun-100 px-2 py-0.5 text-xs font-semibold text-sun-700 dark:bg-sun-700/30 dark:text-sun-200">Reminder sent</span>
          </li>
        </ul>
        <p class="mt-4 flex items-center gap-2 text-xs text-muted"><Lock :size="14" aria-hidden="true" /> Visible only to this group, only for this plan.</p>
      </div>
      <div class="order-1 lg:order-2">
        <p class="eyebrow">Share your locations</p>
        <h2 class="mt-2 text-3xl font-extrabold sm:text-4xl">Private by default. Shared on purpose.</h2>
        <p class="mt-4 text-lg text-ink-soft">
          Use your saved home, your current position (only after you allow it) or drop a pin. No background tracking,
          ever. Stop sharing whenever you like, and Meetzy removes your routes too.
        </p>
        <p class="mt-4 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck :size="18" class="text-mint-600" aria-hidden="true" /> Friends who haven't shared yet get a nudge, not left out.</p>
      </div>
    </div>
  </section>

  <!-- Midpoint explainer -->
  <section id="midpoint" class="scroll-mt-20 bg-navy-900 py-16 text-white sm:py-24 dark:bg-navy-950">
    <div class="page grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div>
        <p class="text-xs font-semibold tracking-[0.08em] text-mint-300 uppercase">Discover your perfect meeting point</p>
        <h2 class="mt-2 text-3xl font-extrabold text-white sm:text-4xl">The middle of the map isn't the middle of the trip.</h2>
        <p class="mt-4 text-lg text-navy-300">
          A river, a highway or a missing metro line can make the geographic midpoint a terrible place to meet.
          Meetzy uses Google's real road and transit times for every friend, then lets your group decide what "fair"
          means.
        </p>
        <div class="mt-8 flex flex-wrap gap-2" role="radiogroup" aria-label="Strategy">
          <button
            v-for="s in strategies"
            :key="s.value"
            type="button"
            role="radio"
            :aria-checked="strategy === s.value"
            class="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors"
            :class="strategy === s.value ? 'bg-mint-400 text-navy-900' : 'bg-white/8 text-white hover:bg-white/14'"
            @click="strategy = s.value"
          >
            <component :is="s.icon" :size="16" aria-hidden="true" /> {{ s.label }}
          </button>
        </div>
        <p class="mt-4 min-h-12 text-navy-300" aria-live="polite">{{ strategies.find((s) => s.value === strategy).text }}</p>
      </div>
      <div class="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 sm:p-6">
        <div class="mb-4 flex flex-wrap gap-3 text-xs font-semibold text-navy-300">
          <span v-for="f in friendsDemo" :key="f.name" class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full" :style="{ background: f.color }" />{{ f.name }}</span>
        </div>
        <ul class="space-y-3">
          <li
            v-for="v in scored"
            :key="v.name"
            class="rounded-2xl p-4 transition-[background-color,box-shadow] duration-300"
            :class="winner === v.name ? 'bg-mint-400/12 ring-2 ring-mint-400' : 'bg-white/4'"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <p class="font-display font-bold text-white">{{ v.name }}</p>
              <span v-if="winner === v.name" class="rounded-full bg-mint-400 px-2.5 py-0.5 text-xs font-bold text-navy-900">Meetzy pick</span>
            </div>
            <div class="space-y-1.5">
              <div v-for="(t, i) in v.times" :key="i" class="flex items-center gap-2">
                <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div class="h-full rounded-full" :style="{ width: `${(t / 35) * 100}%`, background: friendsDemo[i].color }" />
                </div>
                <span class="w-12 text-right text-xs font-semibold text-navy-200 tabular-nums">{{ t }} min</span>
              </div>
            </div>
            <p class="mt-3 text-xs text-navy-300 tabular-nums">avg {{ v.avg.toFixed(1) }} · longest {{ v.max }} · total {{ v.total }} min</p>
          </li>
        </ul>
        <p class="mt-3 text-xs text-navy-400">Sample numbers for illustration. In the app every minute comes from Google Routes.</p>
      </div>
    </div>
  </section>

  <!-- Activities + compare + finalize -->
  <section class="py-16 sm:py-24">
    <div class="page grid gap-5 lg:grid-cols-3">
      <article class="card card-pad">
        <p class="eyebrow">Find activities everyone enjoys</p>
        <h3 class="mt-2 text-xl font-bold">Vote on the vibe</h3>
        <p class="mt-2 text-sm text-ink-soft">Cafes, movies, go-karting, parks, markets, or something custom. Everyone votes; Meetzy searches for what wins.</p>
        <ul class="mt-5 grid grid-cols-2 gap-2">
          <li v-for="a in activities" :key="a.label" class="flex items-center gap-2 rounded-2xl border border-line px-3 py-2.5 text-sm font-semibold" :class="a.votes >= 3 ? 'border-mint-400 bg-mint-50 dark:bg-mint-900/30' : ''">
            <component :is="a.icon" :size="16" class="text-accent-ink" aria-hidden="true" />
            {{ a.label }}
            <span class="ml-auto text-xs text-muted tabular-nums">{{ a.votes }}</span>
          </li>
        </ul>
      </article>
      <article class="card card-pad">
        <p class="eyebrow">Compare travel times</p>
        <h3 class="mt-2 text-xl font-bold">See every trip, side by side</h3>
        <p class="mt-2 text-sm text-ink-soft">Each venue shows how long it takes every friend to get there, with the most balanced option highlighted.</p>
        <div class="mt-5 space-y-2.5">
          <div v-for="(f, i) in friendsDemo" :key="f.name" class="flex items-center gap-3 text-sm">
            <span class="w-12 font-semibold">{{ f.name }}</span>
            <div class="h-2.5 flex-1 rounded-full bg-surface-2"><div class="h-full rounded-full" :style="{ width: `${[60, 69, 57, 66][i]}%`, background: f.color }" /></div>
            <span class="w-12 text-right text-xs font-semibold text-ink-soft tabular-nums">{{ [21, 24, 20, 23][i] }} min</span>
          </div>
        </div>
      </article>
      <article class="card card-pad">
        <p class="eyebrow">Finalize and meet</p>
        <h3 class="mt-2 text-xl font-bold">Lock it in. Get going.</h3>
        <p class="mt-2 text-sm text-ink-soft">The group votes, an admin finalises, and everyone gets directions from where they are.</p>
        <div class="mt-5 rounded-2xl bg-navy-900 p-4 text-white dark:bg-navy-950">
          <p class="text-xs font-semibold text-mint-300">Saturday · 6:30 pm</p>
          <p class="mt-1 font-display text-lg font-bold">Café in the middle</p>
          <div class="mt-3 flex items-center justify-center gap-2 rounded-xl bg-mint-400 px-3 py-2.5 text-sm font-bold text-navy-900"><Navigation :size="16" aria-hidden="true" /> Open in Google Maps</div>
        </div>
      </article>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-24">
    <div class="page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
      <div>
        <p class="eyebrow">Frequently asked questions</p>
        <h2 class="mt-2 text-3xl font-extrabold sm:text-4xl">Good questions.</h2>
        <p class="mt-3 text-ink-soft">Especially the ones about privacy. Your location is yours.</p>
      </div>
      <div class="divide-y divide-line rounded-3xl border border-line bg-canvas">
        <details v-for="f in faqs" :key="f.q" class="group px-5 py-1 sm:px-6">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display font-bold [&::-webkit-details-marker]:hidden">
            {{ f.q }}
            <ChevronDown :size="18" class="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p class="pb-5 text-ink-soft">{{ f.a }}</p>
        </details>
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="py-16 sm:py-24">
    <div class="page">
      <div class="relative overflow-hidden rounded-[2rem] bg-mint-400 px-6 py-12 text-center sm:px-12 sm:py-16">
        <div class="pointer-events-none absolute -right-10 -bottom-16 opacity-25" aria-hidden="true"><AppLogo :size="220" :wordmark="false" /></div>
        <h2 class="relative mx-auto max-w-2xl text-3xl font-extrabold !text-navy-900 sm:text-5xl">Bring your friends together.</h2>
        <p class="relative mx-auto mt-4 max-w-xl text-lg font-medium text-navy-800">We'll find the perfect place in between.</p>
        <div class="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <BaseButton :to="primaryCta" size="lg" variant="dark" :icon="Plus">Plan a Hangout</BaseButton>
          <BaseButton v-if="!auth.isSignedIn" to="/login" size="lg" variant="ghost" class="!text-navy-900 hover:!bg-navy-900/10">I have an account</BaseButton>
        </div>
      </div>
    </div>
  </section>
</template>
