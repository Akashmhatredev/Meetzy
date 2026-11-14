<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { House, MapPin, LocateFixed, MapPinned, Check, ShieldCheck, Send, Copy, ArrowRight, Map as MapIcon, Plus } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import LocationPicker from '@/components/maps/LocationPicker.vue'
import SavedPlaceDialog from '@/components/profile/SavedPlaceDialog.vue'
import NextStepBar from '@/components/hangouts/NextStepBar.vue'
import { useHangoutStore } from '@/stores/hangout'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useGeolocation } from '@/composables/useGeolocation'
import { reverseGeocode, coordinateLabel } from '@/services/googleMaps/geocode'
import { errorMessage } from '@/utils/errors'
import { firstName, timeAgo } from '@/utils/format'
import { appOrigin } from '@/services/config'

const h = useHangoutStore()
const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const { locating, locate } = useGeolocation()

const mode = ref('saved') // saved | current | pin
const selectedPlaceId = ref(null)
const pinned = ref(null)
const busy = ref(false)
const placesLoading = ref(!auth.locationsLoaded)
const addPlaceOpen = ref(false)

onMounted(async () => {
  try {
    await auth.loadLocations()
  } catch {
    // shown as empty list
  } finally {
    placesLoading.value = false
    selectedPlaceId.value = auth.primaryLocation?.id ?? null
    if (!auth.locations.length) mode.value = 'current'
  }
})

const SOURCE_LABEL = { saved: 'Saved place', current: 'Current location', manual: 'Pinned on map' }
const my = computed(() => h.myLocation)

async function share(payload) {
  busy.value = true
  try {
    await h.shareLocation(payload)
    ui.success('Location shared with this hangout.')
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

function shareSaved() {
  if (!selectedPlaceId.value) return
  share({ source: 'saved', savedLocationId: selectedPlaceId.value })
}

async function shareCurrent() {
  try {
    const pos = await locate()
    const found = await reverseGeocode(pos)
    await share({
      source: 'current',
      latitude: pos.lat,
      longitude: pos.lng,
      address: found?.address ?? coordinateLabel(pos),
      label: 'Current location',
    })
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

function sharePinned() {
  if (!pinned.value) return
  share({
    source: 'manual',
    latitude: pinned.value.lat,
    longitude: pinned.value.lng,
    address: pinned.value.address,
    label: pinned.value.name?.slice(0, 40) || 'Pinned location',
  })
}

async function stop() {
  const ok = await ui.confirm({
    title: 'Stop sharing your location?',
    message: 'Your location and any routes calculated from it are removed from this hangout.',
    confirmLabel: 'Stop sharing',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await h.stopSharing()
    ui.success('You stopped sharing your location.')
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

const reminder = computed(
  () =>
    `Hey! Share where you're coming from for "${h.hangout.title}" on Meetzy so we can find a fair place to meet: ${appOrigin()}/hangouts/${h.hangoutId}/location`,
)
async function remind(person) {
  const text = person ? `${firstName(person.name)}, ${reminder.value.charAt(0).toLowerCase()}${reminder.value.slice(1)}` : reminder.value
  try {
    if (navigator.share) await navigator.share({ text })
    else {
      await navigator.clipboard.writeText(text)
      ui.success('Reminder copied. Paste it in your group chat.')
    }
  } catch {
    // dismissed
  }
}

const OPTIONS = [
  { value: 'saved', label: 'Saved place', icon: House },
  { value: 'current', label: 'Current location', icon: LocateFixed },
  { value: 'pin', label: 'Pick on map', icon: MapPinned },
]
</script>

<template>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    <section class="space-y-5">
      <div v-if="my" class="card card-pad border-mint-300 dark:border-mint-800">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mint-400 text-navy-900"><Check :size="22" stroke-width="3" aria-hidden="true" /></span>
          <div class="min-w-0 flex-1">
            <p class="font-display text-lg font-bold">You're sharing {{ my.label || SOURCE_LABEL[my.source] }}</p>
            <p class="truncate text-sm text-ink-soft">{{ my.formatted_address || coordinateLabel({ lat: my.latitude, lng: my.longitude }) }}</p>
            <p class="mt-1 text-xs text-muted">{{ SOURCE_LABEL[my.source] }} · shared {{ timeAgo(my.consented_at) }}</p>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <BaseButton v-if="h.isOpen" variant="danger" size="sm" :loading="busy" @click="stop">Stop sharing</BaseButton>
          <span v-if="h.isOpen" class="self-center text-sm text-muted">or choose a different location below.</span>
        </div>
      </div>

      <div v-if="h.isOpen" class="card card-pad">
        <h2 class="text-lg font-bold">{{ my ? 'Update your location' : 'Where are you coming from?' }}</h2>
        <p class="mt-1 text-sm text-ink-soft">Used only for this hangout's travel times.</p>

        <div role="tablist" aria-label="Location source" class="mt-4 grid grid-cols-3 gap-2">
          <button
            v-for="o in OPTIONS"
            :key="o.value"
            type="button"
            role="tab"
            :aria-selected="mode === o.value"
            class="flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-semibold transition-colors sm:text-sm"
            :class="mode === o.value ? 'border-mint-500 bg-mint-50 text-ink dark:bg-mint-900/30' : 'border-line text-ink-soft hover:border-line-strong'"
            @click="mode = o.value"
          >
            <component :is="o.icon" :size="20" aria-hidden="true" />
            {{ o.label }}
          </button>
        </div>

        <div class="mt-5" role="tabpanel">
          <template v-if="mode === 'saved'">
            <div v-if="placesLoading" class="space-y-2"><SkeletonBlock v-for="n in 2" :key="n" height="3.5rem" rounded="rounded-2xl" /></div>
            <div v-else-if="!auth.locations.length" class="rounded-2xl bg-surface-2 p-4 text-sm text-ink-soft">
              You have no saved places yet.
              <BaseButton class="mt-3" size="sm" :icon="Plus" @click="addPlaceOpen = true">Save a place</BaseButton>
            </div>
            <fieldset v-else class="space-y-2">
              <legend class="sr-only">Choose a saved place</legend>
              <label
                v-for="p in auth.locations"
                :key="p.id"
                class="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors"
                :class="selectedPlaceId === p.id ? 'border-mint-500 bg-mint-50 dark:bg-mint-900/30' : 'border-line hover:border-line-strong'"
              >
                <input v-model="selectedPlaceId" type="radio" name="saved-place" :value="p.id" class="h-4 w-4 accent-mint-600" />
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold">{{ p.location_name }}</span>
                  <span class="block truncate text-sm text-muted">{{ p.formatted_address || coordinateLabel({ lat: p.latitude, lng: p.longitude }) }}</span>
                </span>
              </label>
              <button type="button" class="link pt-1 text-sm" @click="addPlaceOpen = true">+ Save another place</button>
            </fieldset>
            <BaseButton class="mt-4" block :disabled="!selectedPlaceId" :loading="busy" @click="shareSaved">Share this place</BaseButton>
          </template>

          <template v-else-if="mode === 'current'">
            <div class="rounded-2xl bg-surface-2 p-4 text-sm text-ink-soft">
              <p>Your browser will ask for permission. Meetzy reads your position once, right now, and never tracks you in the background.</p>
            </div>
            <BaseButton class="mt-4" block :icon="LocateFixed" :loading="locating || busy" @click="shareCurrent">Share my current location</BaseButton>
          </template>

          <template v-else>
            <LocationPicker v-model="pinned" height="18rem" />
            <BaseButton class="mt-4" block :disabled="!pinned" :loading="busy" @click="sharePinned">Share this spot</BaseButton>
          </template>
        </div>
        <p class="mt-4 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck :size="15" class="mt-px shrink-0" aria-hidden="true" />
          Visible only to members of {{ h.hangout.group?.name }}, only for this hangout. Stop sharing at any time.
        </p>
      </div>
      <p v-else class="card card-pad text-sm text-ink-soft">This hangout is {{ h.hangout.status }}, so locations can no longer change.</p>
    </section>

    <aside class="space-y-5">
      <section class="card card-pad">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-bold">Who's shared</h2>
          <span class="text-sm font-semibold text-muted tabular-nums">{{ h.participants.length }}/{{ h.people.length }}</span>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div class="h-full rounded-full bg-mint-400 transition-[width] duration-500" :style="{ width: `${(h.participants.length / Math.max(1, h.people.length)) * 100}%` }" />
        </div>
        <ul class="mt-4 space-y-2.5">
          <li v-for="p in h.people" :key="p.userId" class="flex items-center gap-3">
            <UserAvatar :name="p.name" :src="p.avatarUrl" :size="36" :color="p.location ? p.color : null" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ p.name }}<span v-if="p.isYou" class="font-normal text-muted"> (you)</span></p>
              <p class="truncate text-xs" :class="p.location ? 'text-accent-ink' : 'text-muted'">
                {{ p.location ? `${p.location.label || SOURCE_LABEL[p.location.source]} · ${SOURCE_LABEL[p.location.source]}` : 'Not shared yet' }}
              </p>
            </div>
            <button
              v-if="!p.location && !p.isYou && h.isOpen"
              type="button"
              class="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-accent-ink hover:bg-accent-soft"
              :aria-label="`Send ${p.name} a reminder`"
              @click="remind(p)"
            >
              <Send :size="13" aria-hidden="true" /> Nudge
            </button>
          </li>
        </ul>
        <div v-if="h.waitingOn.length && h.isOpen" class="mt-4 rounded-2xl bg-warn-soft p-3 text-sm text-warn">
          {{ h.waitingOn.length === 1 ? `${firstName(h.waitingOn[0].name)} hasn't` : `${h.waitingOn.length} friends haven't` }} shared yet. Meetzy won't leave them out silently: remind them, or the meeting point is calculated for those who did.
          <button type="button" class="mt-2 flex items-center gap-1 font-semibold underline underline-offset-4" @click="remind(null)"><Copy :size="14" aria-hidden="true" /> Copy group reminder</button>
        </div>
      </section>
      <BaseButton block variant="secondary" :icon="MapIcon" :to="{ name: 'hangout-map', params: { hangoutId: h.hangoutId } }">See everyone on the map</BaseButton>
    </aside>

    <div class="lg:col-span-2">
      <NextStepBar :hint="h.participants.length >= 2 ? 'Enough locations to find a meeting point.' : 'At least two people need to share a location.'">
        <BaseButton :icon-right="ArrowRight" @click="router.push({ name: 'hangout-activities', params: { hangoutId: h.hangoutId } })">Next: pick activities</BaseButton>
      </NextStepBar>
    </div>
    <SavedPlaceDialog v-model:open="addPlaceOpen" @saved="(row) => ((selectedPlaceId = row.id), (mode = 'saved'))" />
  </div>
</template>
