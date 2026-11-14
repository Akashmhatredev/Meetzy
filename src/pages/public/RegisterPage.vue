<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Mail, Lock, User, MailCheck } from 'lucide-vue-next'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import GoogleSignInButton from '@/components/common/GoogleSignInButton.vue'
import ConfigRequired from '@/components/common/ConfigRequired.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { signUp } from '@/services/supabase/auth'
import { isSupabaseConfigured } from '@/services/config'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'
import { safeRedirect } from '@/utils/redirect'

const route = useRoute()
const router = useRouter()
const form = reactive({ fullName: '', email: '', password: '' })
const errors = ref({})
const formError = ref('')
const busy = ref(false)
const checkEmail = ref(false)
const redirect = computed(() => safeRedirect(route.query.redirect))

async function submit() {
  errors.value = v.validateAll({
    fullName: [v.required('Your name', 2, 80), form.fullName],
    email: [v.email, form.email],
    password: [v.newPassword, form.password],
  })
  formError.value = ''
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    const { session } = await signUp(form)
    if (session) router.replace(redirect.value)
    else checkEmail.value = true // email confirmation is on
  } catch (e) {
    formError.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <template v-if="checkEmail">
      <EmptyState :icon="MailCheck" title="Check your inbox" :description="`We sent a confirmation link to ${form.email}. Open it on this device to finish signing up.`">
        <BaseButton variant="secondary" to="/login">Back to sign in</BaseButton>
      </EmptyState>
    </template>
    <template v-else>
      <h1 class="text-3xl font-extrabold">Create your account</h1>
      <p class="mt-2 text-ink-soft">Less planning, more meeting. It takes a minute.</p>

      <ConfigRequired v-if="!isSupabaseConfigured" class="mt-6" />

      <template v-else>
        <div class="mt-8">
          <GoogleSignInButton :redirect="redirect" label="Sign up with Google" />
        </div>
        <div class="my-6 flex items-center gap-3 text-xs font-semibold tracking-wide text-muted uppercase">
          <span class="h-px flex-1 bg-line" /> or with email <span class="h-px flex-1 bg-line" />
        </div>
        <form class="space-y-4" novalidate @submit.prevent="submit">
          <BaseInput v-model="form.fullName" label="Your name" autocomplete="name" :icon="User" :error="errors.fullName" placeholder="Maya Patel" :maxlength="80" />
          <BaseInput v-model="form.email" label="Email" type="email" autocomplete="email" :icon="Mail" :error="errors.email" placeholder="you@example.com" />
          <BaseInput
            v-model="form.password"
            label="Password"
            type="password"
            autocomplete="new-password"
            :icon="Lock"
            :error="errors.password"
            hint="At least 8 characters with a number."
          />
          <p v-if="formError" class="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
          <BaseButton type="submit" block size="lg" :loading="busy">Create account</BaseButton>
        </form>
        <p class="mt-6 text-center text-sm text-ink-soft">
          Already have an account?
          <RouterLink :to="{ name: 'login', query: route.query }" class="link">Sign in</RouterLink>
        </p>
      </template>
    </template>
  </div>
</template>
