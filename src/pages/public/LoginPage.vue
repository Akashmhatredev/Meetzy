<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Mail, Lock } from 'lucide-vue-next'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import GoogleSignInButton from '@/components/common/GoogleSignInButton.vue'
import ConfigRequired from '@/components/common/ConfigRequired.vue'
import { signInWithPassword } from '@/services/supabase/auth'
import { isSupabaseConfigured } from '@/services/config'
import { errorMessage } from '@/utils/errors'
import * as v from '@/utils/validation'
import { safeRedirect } from '@/utils/redirect'

const route = useRoute()
const router = useRouter()
const form = reactive({ email: '', password: '' })
const errors = ref({})
const formError = ref('')
const busy = ref(false)
const redirect = computed(() => safeRedirect(route.query.redirect))

async function submit() {
  errors.value = v.validateAll({
    email: [v.email, form.email],
    password: [(x) => (x ? '' : 'Enter your password.'), form.password],
  })
  formError.value = ''
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    await signInWithPassword(form.email, form.password)
    router.replace(redirect.value)
  } catch (e) {
    formError.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-3xl font-extrabold">Welcome back</h1>
    <p class="mt-2 text-ink-soft">Sign in to plan your next hangout.</p>

    <ConfigRequired v-if="!isSupabaseConfigured" class="mt-6" />

    <template v-else>
      <div class="mt-8">
        <GoogleSignInButton :redirect="redirect" />
      </div>
      <div class="my-6 flex items-center gap-3 text-xs font-semibold tracking-wide text-muted uppercase">
        <span class="h-px flex-1 bg-line" /> or with email <span class="h-px flex-1 bg-line" />
      </div>
      <form class="space-y-4" novalidate @submit.prevent="submit">
        <BaseInput v-model="form.email" label="Email" type="email" autocomplete="email" :icon="Mail" :error="errors.email" placeholder="you@example.com" />
        <div>
          <BaseInput v-model="form.password" label="Password" type="password" autocomplete="current-password" :icon="Lock" :error="errors.password" />
          <RouterLink to="/forgot-password" class="link mt-2 inline-block text-sm">Forgot password?</RouterLink>
        </div>
        <p v-if="formError" class="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
        <BaseButton type="submit" block size="lg" :loading="busy">Sign in</BaseButton>
      </form>
      <p class="mt-6 text-center text-sm text-ink-soft">
        New to Meetzy?
        <RouterLink :to="{ name: 'register', query: route.query }" class="link">Create an account</RouterLink>
      </p>
    </template>
  </div>
</template>
