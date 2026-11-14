<script setup>
import { reactive, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import AvatarUploader from '@/components/common/AvatarUploader.vue'
import SavedPlacesList from '@/components/profile/SavedPlacesList.vue'
import TravelModePicker from '@/components/hangouts/TravelModePicker.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()

const form = reactive({ full_name: '', avatar_url: null, preferred_travel_mode: 'DRIVE' })
const errors = ref({})
const busy = ref(false)
let filled = false

watchEffect(() => {
  if (filled || !auth.profile) return
  form.full_name = auth.profile.full_name
  form.avatar_url = auth.profile.avatar_url
  form.preferred_travel_mode = auth.profile.preferred_travel_mode
  filled = true
})

async function save() {
  errors.value = v.validateAll({ full_name: [v.required('Your name', 2, 80), form.full_name] })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    await auth.updateProfile({ ...form, full_name: form.full_name.trim() })
    ui.success('Profile saved.')
    router.push('/profile')
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Edit profile" back="/profile" back-label="Profile" />
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <form class="card card-pad space-y-6" novalidate @submit.prevent="save">
        <AvatarUploader
          :folder="auth.userId"
          :current="form.avatar_url"
          @uploaded="(url) => (form.avatar_url = url)"
          @removed="form.avatar_url = null"
        >
          <UserAvatar :name="form.full_name" :src="form.avatar_url" :size="72" />
        </AvatarUploader>
        <BaseInput v-model="form.full_name" label="Full name" autocomplete="name" :maxlength="80" :error="errors.full_name" />
        <BaseInput :model-value="auth.user?.email" label="Email" type="email" disabled hint="Your email is never shown to other members." />
        <div>
          <p class="mb-2 text-sm font-semibold">Preferred travel mode</p>
          <TravelModePicker v-model="form.preferred_travel_mode" />
          <p class="mt-2 text-sm text-muted">Used as the default when you create a hangout.</p>
        </div>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <BaseButton variant="secondary" to="/profile">Cancel</BaseButton>
          <BaseButton type="submit" :loading="busy">Save profile</BaseButton>
        </div>
      </form>
      <SavedPlacesList />
    </div>
  </div>
</template>
