<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Lock, KeyRound } from 'lucide-vue-next'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { updatePassword } from '@/services/supabase/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const password = ref('')
const confirm = ref('')
const errors = ref({})
const busy = ref(false)

async function submit() {
  errors.value = v.validateAll({
    password: [v.newPassword, password.value],
    confirm: [(x) => (x === password.value ? '' : "The passwords don't match."), confirm.value],
  })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    await updatePassword(password.value)
    auth.recoveringPassword = false
    ui.success('Password updated. You are signed in.')
    router.replace('/home')
  } catch (e) {
    errors.value = { password: errorMessage(e) }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <EmptyState
      v-if="!auth.isSignedIn"
      :icon="KeyRound"
      title="This reset link has expired"
      description="Reset links work once, in the browser that asked for them. Request a new one to continue."
    >
      <BaseButton to="/forgot-password">Request a new link</BaseButton>
    </EmptyState>
    <template v-else>
      <h1 class="text-3xl font-extrabold">Choose a new password</h1>
      <p class="mt-2 text-ink-soft">For {{ auth.user?.email }}</p>
      <form class="mt-8 space-y-4" novalidate @submit.prevent="submit">
        <BaseInput v-model="password" label="New password" type="password" autocomplete="new-password" :icon="Lock" :error="errors.password" hint="At least 8 characters with a number." />
        <BaseInput v-model="confirm" label="Confirm password" type="password" autocomplete="new-password" :icon="Lock" :error="errors.confirm" />
        <BaseButton type="submit" block size="lg" :loading="busy">Update password</BaseButton>
      </form>
    </template>
  </div>
</template>
