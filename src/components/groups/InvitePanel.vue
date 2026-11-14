<script setup>
import { computed, onMounted, ref } from 'vue'
import { Link2, Copy, Share2, Plus, Ban, Check } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { createInvitation, revokeInvitation } from '@/services/supabase/groups'
import { useGroupStore } from '@/stores/group'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { dateTime } from '@/utils/format'
import { appOrigin } from '@/services/config'

const props = defineProps({ autoCreate: { type: Boolean, default: false } })
const group = useGroupStore()
const auth = useAuthStore()
const ui = useUiStore()

const expiry = ref(168)
const maxUses = ref(null)
const busy = ref(false)
const copied = ref(null)

const EXPIRY = [
  { value: 24, label: 'Expires in 1 day' },
  { value: 168, label: 'Expires in 7 days' },
  { value: 720, label: 'Expires in 30 days' },
  { value: null, label: 'Never expires' },
]
const USES = [
  { value: null, label: 'Unlimited uses' },
  { value: 1, label: '1 use' },
  { value: 5, label: '5 uses' },
  { value: 10, label: '10 uses' },
  { value: 25, label: '25 uses' },
]

const linkFor = (invite) => `${appOrigin()}/join/${invite.invite_code}`
const latest = computed(() => group.activeInvitations[0] ?? null)
const canShare = typeof navigator !== 'undefined' && !!navigator.share

async function create() {
  busy.value = true
  try {
    await createInvitation(group.groupId, { expiresInHours: expiry.value, maxUses: maxUses.value })
    await group.refresh()
    ui.success('New invite link ready.')
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

async function copy(invite) {
  try {
    await navigator.clipboard.writeText(linkFor(invite))
    copied.value = invite.id
    setTimeout(() => (copied.value = null), 1800)
  } catch {
    ui.error("Couldn't copy. Select the link and copy it manually.")
  }
}

async function share(invite) {
  try {
    await navigator.share({
      title: `Join ${group.group.name} on Meetzy`,
      text: `Join ${group.group.name} on Meetzy so we can plan where to meet.`,
      url: linkFor(invite),
    })
  } catch {
    // dismissed
  }
}

async function revoke(invite) {
  const ok = await ui.confirm({
    title: 'Revoke this invite?',
    message: 'The link stops working immediately. People who already joined stay in the group.',
    confirmLabel: 'Revoke link',
    danger: true,
  })
  if (!ok) return
  try {
    await revokeInvitation(invite.id)
    await group.refresh()
    ui.success('Invite revoked.')
  } catch (e) {
    ui.error(errorMessage(e))
  }
}

const canRevoke = (invite) => group.isAdmin || invite.created_by === auth.userId

onMounted(() => {
  if (props.autoCreate && !group.activeInvitations.length) create()
})
</script>

<template>
  <section class="card card-pad">
    <h2 class="flex items-center gap-2 text-lg font-bold"><Link2 :size="20" class="text-accent-ink" aria-hidden="true" /> Invite friends</h2>
    <p class="mt-1 text-sm text-ink-soft">Anyone with an active link can join. You can revoke a link any time.</p>

    <div v-if="latest" class="mt-4 rounded-2xl border border-mint-300 bg-mint-50 p-3 dark:border-mint-800 dark:bg-mint-900/25">
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2.5 text-sm font-semibold">{{ linkFor(latest) }}</code>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <BaseButton size="sm" :icon="copied === latest.id ? Check : Copy" @click="copy(latest)">{{ copied === latest.id ? 'Copied' : 'Copy link' }}</BaseButton>
        <BaseButton v-if="canShare" size="sm" variant="secondary" :icon="Share2" @click="share(latest)">Share</BaseButton>
        <span class="ml-auto font-mono text-sm font-bold tracking-widest text-ink-soft" aria-label="Invite code">{{ latest.invite_code }}</span>
      </div>
    </div>

    <details class="group mt-4">
      <summary class="cursor-pointer list-none text-sm font-semibold text-accent-ink [&::-webkit-details-marker]:hidden">
        {{ latest ? 'Create another link' : 'Link options' }}
      </summary>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <BaseSelect v-model="expiry" :options="EXPIRY" label="Expiry" />
        <BaseSelect v-model="maxUses" :options="USES" label="Uses" />
      </div>
    </details>
    <BaseButton class="mt-4" :variant="latest ? 'secondary' : 'primary'" :icon="Plus" :loading="busy" @click="create">
      {{ latest ? 'New invite link' : 'Create invite link' }}
    </BaseButton>

    <div v-if="group.activeInvitations.length > 1 || (group.activeInvitations.length && group.isAdmin)" class="mt-6">
      <h3 class="mb-2 text-sm font-bold">Active links</h3>
      <ul class="divide-y divide-line rounded-2xl border border-line">
        <li v-for="i in group.activeInvitations" :key="i.id" class="flex items-center gap-3 px-3 py-2.5 text-sm">
          <span class="font-mono font-bold tracking-wider">{{ i.invite_code }}</span>
          <span class="min-w-0 flex-1 truncate text-muted">
            {{ i.expires_at ? `until ${dateTime(i.expires_at)}` : 'no expiry' }} · {{ i.use_count }}{{ i.max_uses ? `/${i.max_uses}` : '' }} joined
          </span>
          <button type="button" class="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" :aria-label="`Copy link ${i.invite_code}`" @click="copy(i)">
            <Check v-if="copied === i.id" :size="16" aria-hidden="true" />
            <Copy v-else :size="16" aria-hidden="true" />
          </button>
          <button v-if="canRevoke(i)" type="button" class="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger" :aria-label="`Revoke ${i.invite_code}`" @click="revoke(i)">
            <Ban :size="16" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
