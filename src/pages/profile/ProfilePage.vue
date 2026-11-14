<script setup>
import { computed } from 'vue'
import { Pencil, CalendarDays, Mail } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import SavedPlacesList from '@/components/profile/SavedPlacesList.vue'
import { useAuthStore } from '@/stores/auth'
import { travelMode } from '@/utils/domain'
import { longDate } from '@/utils/format'

const auth = useAuthStore()
const mode = computed(() => travelMode(auth.profile?.preferred_travel_mode))
</script>

<template>
  <div>
    <PageHeader title="Profile" subtitle="How your friends see you, and the places you plan from.">
      <template #actions>
        <BaseButton variant="secondary" :icon="Pencil" to="/profile/edit">Edit profile</BaseButton>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section class="card card-pad">
        <div class="flex items-center gap-4">
          <UserAvatar :name="auth.displayName" :src="auth.profile?.avatar_url" :size="72" />
          <div class="min-w-0">
            <h2 class="truncate text-xl font-bold">{{ auth.displayName || 'Your name' }}</h2>
            <p class="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-soft">
              <Mail :size="15" aria-hidden="true" /> {{ auth.user?.email }}
            </p>
          </div>
        </div>
        <dl class="mt-6 divide-y divide-line rounded-2xl border border-line">
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <dt class="text-sm text-ink-soft">Usually travels by</dt>
            <dd class="flex items-center gap-2 text-sm font-semibold">
              <component :is="mode.icon" :size="16" aria-hidden="true" /> {{ mode.label }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <dt class="text-sm text-ink-soft">Member since</dt>
            <dd class="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays :size="16" aria-hidden="true" /> {{ longDate(auth.profile?.created_at ?? auth.user?.created_at) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <dt class="text-sm text-ink-soft">Signed in with</dt>
            <dd class="text-sm font-semibold capitalize">{{ auth.user?.app_metadata?.provider ?? 'email' }}</dd>
          </div>
        </dl>
        <p class="mt-4 text-xs text-muted">Group members see your name and avatar. Your email stays private.</p>
      </section>

      <SavedPlacesList />
    </div>
  </div>
</template>
