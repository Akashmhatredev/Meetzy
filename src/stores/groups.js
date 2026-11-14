import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/services/supabase/groups'
import { listRecentHangouts } from '@/services/supabase/hangouts'

/** The signed-in user's groups and recent hangouts (home + groups list). */
export const useGroupsStore = defineStore('groups', () => {
  const groups = ref([])
  const hangouts = ref([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref(null)

  async function load({ silent = false } = {}) {
    if (!silent) loading.value = true
    error.value = null
    try {
      const [g, h] = await Promise.all([api.listMyGroups(), listRecentHangouts(20)])
      groups.value = g
      hangouts.value = h
      loaded.value = true
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function create(input) {
    const group = await api.createGroup(input)
    load({ silent: true })
    return group
  }

  function reset() {
    groups.value = []
    hangouts.value = []
    loaded.value = false
  }

  return { groups, hangouts, loaded, loading, error, load, create, reset }
})
