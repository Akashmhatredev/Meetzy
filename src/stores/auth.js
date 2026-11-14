import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isSupabaseConfigured } from '@/services/config'
import * as authApi from '@/services/supabase/auth'
import * as profileApi from '@/services/supabase/profiles'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const ready = ref(false)
  const recoveringPassword = ref(false)
  const profile = ref(null)
  const locations = ref([])
  const locationsLoaded = ref(false)

  const user = computed(() => session.value?.user ?? null)
  const userId = computed(() => user.value?.id ?? null)
  const isSignedIn = computed(() => !!user.value)
  const displayName = computed(
    () => profile.value?.full_name || user.value?.user_metadata?.full_name || user.value?.email?.split('@')[0] || '',
  )
  const primaryLocation = computed(() => locations.value.find((l) => l.is_primary) ?? locations.value[0] ?? null)

  let initPromise = null
  let unsubscribe = null
  const signOutListeners = new Set()

  function init() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      if (!isSupabaseConfigured) {
        ready.value = true
        return
      }
      try {
        session.value = await authApi.getSession()
      } catch {
        session.value = null
      }
      unsubscribe = authApi.onAuthChange((event, next) => {
        const previousId = userId.value
        session.value = next
        if (event === 'PASSWORD_RECOVERY') recoveringPassword.value = true
        if (!next) {
          profile.value = null
          locations.value = []
          locationsLoaded.value = false
          signOutListeners.forEach((fn) => fn())
        } else if (next.user.id !== previousId) {
          // Don't await Supabase calls inside the auth callback (supabase-js deadlock).
          setTimeout(() => loadProfile(), 0)
        }
      })
      if (session.value) await loadProfile()
      ready.value = true
    })()
    return initPromise
  }

  async function loadProfile() {
    if (!userId.value) return
    try {
      profile.value = await profileApi.getProfile(userId.value)
    } catch {
      profile.value = null
    }
  }

  async function loadLocations(force = false) {
    if (locationsLoaded.value && !force) return locations.value
    locations.value = await profileApi.listLocations()
    locationsLoaded.value = true
    return locations.value
  }

  async function updateProfile(patch) {
    profile.value = await profileApi.updateProfile(userId.value, patch)
    return profile.value
  }

  async function saveLocation(input, id = null) {
    const row = id ? await profileApi.updateLocation(id, input) : await profileApi.createLocation(input)
    await loadLocations(true)
    return row
  }

  async function makePrimary(id) {
    await profileApi.setPrimaryLocation(id)
    await loadLocations(true)
  }

  async function removeLocation(id) {
    await profileApi.deleteLocation(id)
    await loadLocations(true)
  }

  async function signOut() {
    await authApi.signOut()
    session.value = null
  }

  function onSignOut(fn) {
    signOutListeners.add(fn)
    return () => signOutListeners.delete(fn)
  }

  function dispose() {
    unsubscribe?.()
  }

  return {
    session,
    ready,
    recoveringPassword,
    profile,
    locations,
    locationsLoaded,
    user,
    userId,
    isSignedIn,
    displayName,
    primaryLocation,
    init,
    loadProfile,
    loadLocations,
    updateProfile,
    saveLocation,
    makePrimary,
    removeLocation,
    signOut,
    onSignOut,
    dispose,
  }
})
