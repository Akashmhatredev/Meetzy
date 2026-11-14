import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '@/services/supabase/groups'
import { listGroupHangouts } from '@/services/supabase/hangouts'
import { subscribe, debounce } from '@/services/supabase/realtime'
import { useAuthStore } from './auth'
import { AppError } from '@/utils/errors'

/** The group currently open in /groups/:groupId, kept live with Realtime. */
export const useGroupStore = defineStore('group', () => {
  const groupId = ref(null)
  const group = ref(null)
  const members = ref([])
  const invitations = ref([])
  const hangouts = ref([])
  const loading = ref(false)
  const error = ref(null)
  let stop = null

  const auth = useAuthStore()
  const me = computed(() => members.value.find((m) => m.user_id === auth.userId) ?? null)
  const isAdmin = computed(() => me.value?.role === 'admin')
  const activeInvitations = computed(() =>
    invitations.value.filter(
      (i) =>
        !i.revoked_at &&
        (!i.expires_at || new Date(i.expires_at) > new Date()) &&
        (i.max_uses == null || i.use_count < i.max_uses),
    ),
  )
  const sharingCount = computed(() => members.value.filter((m) => m.location_sharing_enabled).length)

  async function fetchAll(id) {
    const [g, m, i, h] = await Promise.all([
      api.getGroup(id),
      api.listMembers(id),
      api.listInvitations(id),
      listGroupHangouts(id),
    ])
    if (groupId.value !== id) return
    if (!g) throw new AppError('not_found')
    group.value = g
    members.value = m
    invitations.value = i
    hangouts.value = h
  }

  async function open(id) {
    if (groupId.value === id && group.value) return
    close()
    groupId.value = id
    loading.value = true
    error.value = null
    try {
      await fetchAll(id)
      listen(id)
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      loading.value = false
    }
  }

  const reload = debounce(async () => {
    if (!groupId.value) return
    try {
      await fetchAll(groupId.value)
    } catch (e) {
      // Removed from the group, or the group was deleted.
      error.value = AppError.from(e)
    }
  }, 300)

  function listen(id) {
    const filter = `group_id=eq.${id}`
    stop = subscribe(
      'group',
      [
        { table: 'groups', filter: `id=eq.${id}` },
        { table: 'group_members', filter },
        { table: 'group_invitations', filter },
        { table: 'hangouts', filter },
      ],
      ({ table, event, payload }) => {
        if (event === 'DELETE') {
          const oldId = payload.old?.id
          const known =
            (table === 'groups' && oldId === id) ||
            members.value.some((m) => m.id === oldId) ||
            invitations.value.some((i) => i.id === oldId) ||
            hangouts.value.some((h) => h.id === oldId)
          if (!known) return
        }
        reload()
      },
    )
  }

  function close() {
    stop?.()
    stop = null
    reload.cancel()
    groupId.value = null
    group.value = null
    members.value = []
    invitations.value = []
    hangouts.value = []
    error.value = null
  }

  async function refresh() {
    if (groupId.value) await fetchAll(groupId.value)
  }

  return {
    groupId,
    group,
    members,
    invitations,
    hangouts,
    loading,
    error,
    me,
    isAdmin,
    activeInvitations,
    sharingCount,
    open,
    close,
    refresh,
  }
})
