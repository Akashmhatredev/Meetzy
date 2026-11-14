<script setup>
import { ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import LocationPicker from '@/components/maps/LocationPicker.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  place: { type: Object, default: null }, // existing user_locations row to edit
})
const emit = defineEmits(['saved'])

const auth = useAuthStore()
const ui = useUiStore()
const name = ref('Home')
const point = ref(null)
const nameError = ref('')
const busy = ref(false)

watch(open, (value) => {
  if (!value) return
  nameError.value = ''
  if (props.place) {
    name.value = props.place.location_name
    point.value = {
      lat: props.place.latitude,
      lng: props.place.longitude,
      address: props.place.formatted_address,
      placeId: props.place.place_id,
    }
  } else {
    name.value = auth.locations.length ? '' : 'Home'
    point.value = null
  }
})

async function save() {
  nameError.value = name.value.trim() ? (name.value.trim().length > 40 ? 'Up to 40 characters.' : '') : 'Give this place a name.'
  if (nameError.value || !point.value) return
  busy.value = true
  try {
    const row = await auth.saveLocation(
      {
        location_name: name.value,
        latitude: point.value.lat,
        longitude: point.value.lng,
        formatted_address: point.value.address,
        place_id: point.value.placeId,
      },
      props.place?.id,
    )
    ui.success(props.place ? 'Place updated.' : 'Place saved.')
    emit('saved', row)
    open.value = false
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="place ? 'Edit saved place' : 'Save a place'"
    description="Saved places are private to you. Friends only see a location when you share it with a hangout."
    size="lg"
  >
    <div class="space-y-4">
      <BaseInput v-model="name" label="Name" placeholder="Home, Office, Gym…" :maxlength="40" :error="nameError" />
      <LocationPicker v-model="point" height="16rem" />
    </div>
    <template #footer>
      <BaseButton variant="secondary" @click="open = false">Cancel</BaseButton>
      <BaseButton :disabled="!point" :loading="busy" @click="save">{{ place ? 'Save changes' : 'Save place' }}</BaseButton>
    </template>
  </BaseDialog>
</template>
