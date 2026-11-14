<script setup>
import { ref } from 'vue'
import { Mail, MailCheck } from 'lucide-vue-next'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import ConfigRequired from '@/components/common/ConfigRequired.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { sendPasswordReset } from '@/services/supabase/auth'
import { isSupabaseConfigured } from '@/services/config'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'

const email = ref('')
const error = ref('')
const busy = ref(false)
const sent = ref(false)

async function submit() {
  error.value = v.email(email.value)
  if (error.value) return
  busy.value = true
  try {
    await sendPasswordReset(email.value)
    sent.value = true
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <EmptyState
      v-if="sent"
      :icon="MailCheck"
      title="Check your email"
      :description="`If an account exists for ${email}, a reset link is on its way. Open it in this browser.`"
    >
      <BaseButton variant="secondary" to="/login">Back to sign in</BaseButton>
    </EmptyState>
    <template v-else>
      <h1 class="text-3xl font-extrabold">Forgot your password?</h1>
      <p class="mt-2 text-ink-soft">Enter your email and we'll send you a link to choose a new one.</p>
      <ConfigRequired v-if="!isSupabaseConfigured" class="mt-6" />
      <form v-else class="mt-8 space-y-4" novalidate @submit.prevent="submit">
        <BaseInput v-model="email" label="Email" type="email" autocomplete="email" :icon="Mail" :error="error" placeholder="you@example.com" />
        <BaseButton type="submit" block size="lg" :loading="busy">Send reset link</BaseButton>
        <p class="text-center text-sm text-ink-soft"><RouterLink to="/login" class="link">Back to sign in</RouterLink></p>
      </form>
    </template>
  </div>
</template>
