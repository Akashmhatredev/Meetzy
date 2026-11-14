<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { UsersRound, CircleAlert } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonBlock from '@/components/common/SkeletonBlock.vue'
import ConfigRequired from '@/components/common/ConfigRequired.vue'
import GroupAvatar from '@/components/groups/GroupAvatar.vue'
import { previewInvitation, joinWithCode } from '@/services/supabase/groups'
import { isSupabaseConfigured } from '@/services/config'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { normalizeInviteCode } from '@/utils/validation'
import { plural } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const groups = useGroupsStore()
const ui = useUiStore()

const code = computed(() => normalizeInviteCode(String(route.params.code ?? '')))
const preview = ref(null)
const loading = ref(true)
const joining = ref(false)
const loadError = ref('')

const STATUS_COPY = {
  not_found: ['Invite not found', 'Double-check the link, or ask your friend for a new one.'],
  expired: ['This invite has expired', 'Ask someone in the group to send a fresh link.'],
  revoked: ['This invite was turned off', 'An admin revoked this link. Ask for a new one.'],
  exhausted: ['This invite is used up', 'It reached its limit. Ask for a new link.'],
  group_full: ['This group is full', 'Groups can have up to 50 members.'],
  group_limit_reached: ["You're in a lot of groups", 'You can be in up to 50 groups. Leave one to join this.'],
}

onMounted(async () => {
  if (!isSupabaseConfigured) return (loading.value = false)
  try {
    preview.value = await previewInvitation(code.value)
  } catch (e) {
    loadError.value = errorMessage(e)
  } finally {
    loading.value = false
  }
})

async function join() {
  joining.value = true
  try {
    const result = await joinWithCode(code.value)
    if (result.status === 'joined' || result.status === 'already_member') {
      groups.load({ silent: true })
      ui.success(result.status === 'joined' ? `You joined ${preview.value?.group_name ?? 'the group'}!` : "You're already in this group.")
      router.replace(`/groups/${result.group_id}`)
    } else {
      preview.value = { ...preview.value, status: result.status }
    }
  } catch (e) {
    ui.error(errorMessage(e))
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div>
    <ConfigRequired v-if="!isSupabaseConfigured" />
    <div v-else-if="loading" class="card card-pad space-y-4">
      <SkeletonBlock height="4rem" width="4rem" rounded="rounded-3xl" />
      <SkeletonBlock :lines="2" />
      <SkeletonBlock height="3rem" />
    </div>
    <EmptyState v-else-if="loadError" :icon="CircleAlert" title="Couldn't load this invite" :description="loadError" tone="sun">
      <BaseButton variant="secondary" to="/">Go home</BaseButton>
    </EmptyState>
    <EmptyState
      v-else-if="preview?.status !== 'valid' && !preview?.already_member"
      :icon="CircleAlert"
      :title="(STATUS_COPY[preview?.status] ?? STATUS_COPY.not_found)[0]"
      :description="(STATUS_COPY[preview?.status] ?? STATUS_COPY.not_found)[1]"
      tone="sun"
    >
      <BaseButton v-if="auth.isSignedIn" variant="secondary" to="/groups/join">Enter a different code</BaseButton>
      <BaseButton v-else variant="secondary" to="/">Go home</BaseButton>
    </EmptyState>
    <div v-else class="card card-pad text-center">
      <GroupAvatar
        class="mx-auto"
        :group="{ avatar_emoji: preview.group_emoji, color: preview.group_color, avatar_url: preview.group_avatar_url, name: preview.group_name }"
        :size="72"
      />
      <p class="mt-5 text-sm font-semibold text-muted">
        {{ preview.inviter_name ? `${preview.inviter_name} invited you to` : "You're invited to" }}
      </p>
      <h1 class="mt-1 text-3xl font-extrabold">{{ preview.group_name }}</h1>
      <p class="mt-2 flex items-center justify-center gap-1.5 text-sm text-ink-soft">
        <UsersRound :size="16" aria-hidden="true" /> {{ plural(preview.member_count, 'member') }}
      </p>
      <div class="mt-7 space-y-3">
        <template v-if="auth.isSignedIn">
          <BaseButton v-if="preview.already_member" block size="lg" :to="`/groups/${preview.group_id}`">Open group</BaseButton>
          <BaseButton v-else block size="lg" :loading="joining" @click="join">Join group</BaseButton>
          <p class="text-xs text-muted">Signed in as {{ auth.user?.email }}</p>
        </template>
        <template v-else>
          <BaseButton block size="lg" :to="{ name: 'register', query: { redirect: route.fullPath } }">Create an account to join</BaseButton>
          <BaseButton block variant="secondary" :to="{ name: 'login', query: { redirect: route.fullPath } }">I already have an account</BaseButton>
        </template>
      </div>
      <p class="mt-6 text-xs text-muted">Members can see your name and avatar. Your location is only shared when you choose to.</p>
    </div>
  </div>
</template>
