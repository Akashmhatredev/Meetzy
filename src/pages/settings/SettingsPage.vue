<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sun, Moon, Monitor, LogOut, Trash2, ShieldCheck, MapPinOff, KeyRound } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import TravelModePicker from '@/components/hangouts/TravelModePicker.vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { deleteMyAccount, sendPasswordReset } from '@/services/supabase/auth'
import { errorMessage } from '@/utils/errors'

const ui = useUiStore()
const auth = useAuthStore()
const router = useRouter()
const busy = ref('')

const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

async function setMode(mode) {
  try {
    await auth.updateProfile({ preferred_travel_mode: mode })
    ui.success('Default travel mode saved.')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

async function clearPlaces() {
  const ok = await ui.confirm({
    title: 'Delete all saved places?',
    message: 'Your saved places are removed, and any hangout still being planned stops using them. Finalised plans keep their travel times.',
    confirmLabel: 'Delete places',
    danger: true,
  })
  if (!ok) return
  busy.value = 'places'
  try {
    await auth.loadLocations(true)
    for (const place of [...auth.locations]) await auth.removeLocation(place.id)
    ui.success('All saved places deleted.')
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}

async function resetPassword() {
  busy.value = 'password'
  try {
    await sendPasswordReset(auth.user.email)
    ui.success(`Reset link sent to ${auth.user.email}.`)
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}

async function signOut() {
  busy.value = 'signout'
  try {
    await auth.signOut()
    router.replace('/')
  } catch (e) {
    ui.error(errorMessage(e))
    busy.value = ''
  }
}

async function deleteAccount() {
  const ok = await ui.confirm({
    title: 'Delete your Meetzy account?',
    message: 'This permanently deletes your profile, saved places, location shares and votes. Groups you admin pass to another member. This cannot be undone.',
    confirmLabel: 'Delete account',
    danger: true,
  })
  if (!ok) return
  busy.value = 'delete'
  try {
    await deleteMyAccount()
    ui.success('Your account was deleted.')
    router.replace('/')
  } catch (e) {
    ui.error(errorMessage(e))
    busy.value = ''
  }
}
</script>

<template>
  <div>
    <PageHeader title="Settings" />
    <div class="space-y-5">
      <section class="card card-pad">
        <h2 class="text-lg font-bold">Appearance</h2>
        <p class="mt-1 mb-4 text-sm text-ink-soft">Meetzy follows your device unless you pick a theme.</p>
        <SegmentedControl :model-value="ui.theme" :options="themes" label="Theme" @update:model-value="ui.setTheme" />
      </section>

      <section class="card card-pad">
        <h2 class="text-lg font-bold">Default travel mode</h2>
        <p class="mt-1 mb-4 text-sm text-ink-soft">Pre-selected when you create a hangout. Each hangout can still change it.</p>
        <TravelModePicker :model-value="auth.profile?.preferred_travel_mode ?? 'DRIVE'" @update:model-value="setMode" />
      </section>

      <section class="card card-pad">
        <h2 class="flex items-center gap-2 text-lg font-bold"><ShieldCheck :size="20" class="text-accent-ink" aria-hidden="true" /> Privacy</h2>
        <ul class="mt-3 space-y-2 text-sm text-ink-soft">
          <li>• Meetzy never tracks your location in the background. Current location is read once, when you tap the button.</li>
          <li>• Saved places are visible only to you. A hangout sees a location only after you share it, and you can stop sharing any time.</li>
          <li>• Group members see your name and avatar, never your email.</li>
        </ul>
        <div class="mt-5 flex flex-wrap gap-2">
          <BaseButton variant="secondary" :icon="MapPinOff" :loading="busy === 'places'" @click="clearPlaces">Delete all saved places</BaseButton>
          <BaseButton variant="secondary" to="/groups">Manage group sharing</BaseButton>
        </div>
      </section>

      <section class="card card-pad">
        <h2 class="text-lg font-bold">Account</h2>
        <p class="mt-1 text-sm text-ink-soft">Signed in as {{ auth.user?.email }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <BaseButton variant="secondary" :icon="KeyRound" :loading="busy === 'password'" @click="resetPassword">Email me a password reset</BaseButton>
          <BaseButton variant="secondary" :icon="LogOut" :loading="busy === 'signout'" @click="signOut">Sign out</BaseButton>
        </div>
        <div class="mt-6 rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <h3 class="font-bold text-danger">Delete account</h3>
          <p class="mt-1 text-sm text-ink-soft">Removes your account and all personal data from Meetzy.</p>
          <BaseButton class="mt-3" variant="danger" :icon="Trash2" :loading="busy === 'delete'" @click="deleteAccount">Delete my account</BaseButton>
        </div>
      </section>
    </div>
  </div>
</template>
