<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { setGroupLocationSharing } from '@/services/supabase/groups'
import { useGroupStore } from '@/stores/group'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'

const group = useGroupStore()
const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const busy = ref(false)

onMounted(() => auth.loadLocations().catch(() => {}))

const enabled = computed({
  get: () => !!group.me?.location_sharing_enabled,
  set: (value) => toggle(value),
})

async function toggle(value) {
  if (value && !auth.primaryLocation) {
    ui.toast('Save a home location first, then turn this on.', {
      action: { label: 'Add place', run: () => router.push('/profile') },
    })
    return
  }
  busy.value = true
  try {
    const count = await setGroupLocationSharing(group.groupId, value)
    await group.refresh()
    ui.success(
      value
        ? `Sharing ${auth.primaryLocation.location_name} with ${group.group.name}${count ? ` (added to ${count} open plan${count === 1 ? '' : 's'})` : ''}.`
        : `Stopped sharing with ${group.group.name}${count ? ` and removed ${count} location share${count === 1 ? '' : 's'}` : ''}.`,
    )
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ToggleSwitch
    v-model="enabled"
    :busy="busy"
    label="Share my default place with this group's plans"
    :description="
      auth.primaryLocation
        ? `Your '${auth.primaryLocation.location_name}' is added to each hangout you're part of here. Turn off to withdraw it from plans still in progress.`
        : 'Save a home location in your profile to use this.'
    "
  />
</template>
