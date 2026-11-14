<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Ticket } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import BaseInput from '@/components/common/BaseInput.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import { inviteCode, normalizeInviteCode } from '@/utils/validation'

const router = useRouter()
const code = ref('')
const error = ref('')

function submit() {
  error.value = inviteCode(code.value)
  if (error.value) return
  router.push({ name: 'join-invite', params: { code: normalizeInviteCode(code.value) } })
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <PageHeader title="Join a group" subtitle="Paste an invite link or type the 8-character code a friend sent you." back="/groups" back-label="Groups" />
    <form class="card card-pad space-y-5" novalidate @submit.prevent="submit">
      <BaseInput
        v-model="code"
        label="Invite code or link"
        :icon="Ticket"
        placeholder="K7QM4TZP"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        :error="error"
        hint="Codes use letters and numbers, no O, I, 0 or 1."
      />
      <BaseButton type="submit" block size="lg">Continue</BaseButton>
    </form>
  </div>
</template>
