<script setup>
import { onMounted, ref } from 'vue'
import { House, MapPin, Plus, Pencil, Trash2, Star } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import DropdownMenu from '@/components/common/DropdownMenu.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import SavedPlaceDialog from './SavedPlaceDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const auth = useAuthStore()
const ui = useUiStore()
const dialogOpen = ref(false)
const editing = ref(null)
const loading = ref(!auth.locationsLoaded)

onMounted(async () => {
  try {
    await auth.loadLocations()
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    loading.value = false
  }
})

function add() {
  editing.value = null
  dialogOpen.value = true
}
function edit(place) {
  editing.value = place
  dialogOpen.value = true
}
async function remove(place) {
  const ok = await ui.confirm({
    title: `Delete "${place.location_name}"?`,
    message: 'Any hangout you shared this place with (that is still being planned) stops using it.',
    confirmLabel: 'Delete place',
    danger: true,
  })
  if (!ok) return
  try {
    await auth.removeLocation(place.id)
    ui.success('Place deleted.')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}
async function primary(place) {
  try {
    await auth.makePrimary(place.id)
    ui.success(`${place.location_name} is now your default place.`)
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

const menu = (place) => [
  { label: 'Edit', icon: Pencil, onSelect: () => edit(place) },
  ...(place.is_primary ? [] : [{ label: 'Make default', icon: Star, onSelect: () => primary(place) }]),
  { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(place) },
]
</script>

<template>
  <section class="card card-pad">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold">Saved places</h2>
        <p class="text-sm text-ink-soft">Only you can see these.</p>
      </div>
      <BaseButton v-if="auth.locations.length" size="sm" variant="secondary" :icon="Plus" @click="add">Add</BaseButton>
    </div>
    <div v-if="loading" class="space-y-2">
      <SkeletonBlock v-for="n in 2" :key="n" height="4rem" rounded="rounded-2xl" />
    </div>
    <EmptyState
      v-else-if="!auth.locations.length"
      :icon="House"
      title="Save your home location"
      description="Sharing a saved place with a hangout takes one tap. You can also drop a pin or use your current location each time."
      compact
    >
      <BaseButton :icon="Plus" @click="add">Add home location</BaseButton>
    </EmptyState>
    <ul v-else class="space-y-2">
      <li v-for="p in auth.locations" :key="p.id" class="flex items-center gap-3 rounded-2xl border border-line p-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700 dark:bg-mint-900/50 dark:text-mint-300">
          <House v-if="/home/i.test(p.location_name)" :size="19" aria-hidden="true" />
          <MapPin v-else :size="19" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 font-semibold">
            <span class="truncate">{{ p.location_name }}</span>
            <span v-if="p.is_primary" class="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink">Default</span>
          </p>
          <p class="truncate text-sm text-muted">{{ p.formatted_address || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}` }}</p>
        </div>
        <DropdownMenu :items="menu(p)" :label="`Actions for ${p.location_name}`" />
      </li>
    </ul>
    <SavedPlaceDialog v-model:open="dialogOpen" :place="editing" />
  </section>
</template>
