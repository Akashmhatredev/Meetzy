import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '@/services/supabase/hangouts'
import { listMembers } from '@/services/supabase/groups'
import { subscribe, debounce } from '@/services/supabase/realtime'
import { computeMeetup, fetchVenueRoutes, rankVenues } from '@/services/midpoint'
import { useAuthStore } from './auth'
import { AppError } from '@/utils/errors'
import { memberColor, isOpenStatus } from '@/utils/domain'

/**
 * Everything about the hangout open under /hangouts/:id. One Realtime
 * channel keeps locations, activities, votes and venues in sync for every
 * child page; HangoutLayout opens and closes it.
 */
export const useHangoutStore = defineStore('hangout', () => {
  const auth = useAuthStore()

  const hangoutId = ref(null)
  const hangout = ref(null)
  const members = ref([])
  const locations = ref([])
  const catalogue = ref([])
  const shortlist = ref([])
  const activityVotes = ref([])
  const venues = ref([])
  const routes = ref([])
  const venueVotes = ref([])
  const run = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const calculating = ref(false)
  let stop = null

  // -------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------
  const me = computed(() => auth.userId)
  const myMember = computed(() => members.value.find((m) => m.user_id === me.value) ?? null)
  const canManage = computed(
    () => myMember.value?.role === 'admin' || (hangout.value && hangout.value.created_by === me.value),
  )
  const isOpen = computed(() => (hangout.value ? isOpenStatus(hangout.value.status) : false))
  const isStale = computed(() => !!hangout.value?.inputs_changed_at && venues.value.length > 0)

  const people = computed(() =>
    members.value.map((m, index) => ({
      userId: m.user_id,
      name: m.profile?.full_name || 'Member',
      avatarUrl: m.profile?.avatar_url || null,
      role: m.role,
      color: memberColor(index),
      isYou: m.user_id === me.value,
      location: locations.value.find((l) => l.user_id === m.user_id) ?? null,
    })),
  )
  const personById = computed(() => new Map(people.value.map((p) => [p.userId, p])))
  const participants = computed(() => people.value.filter((p) => p.location))
  const waitingOn = computed(() => people.value.filter((p) => !p.location))
  const myLocation = computed(() => locations.value.find((l) => l.user_id === me.value) ?? null)

  const activities = computed(() =>
    shortlist.value
      .map((item) => {
        const voters = activityVotes.value.filter((v) => v.activity_id === item.activity_id).map((v) => v.user_id)
        return {
          ...item.activity,
          id: item.activity_id,
          addedBy: item.created_by,
          voters,
          votes: voters.length,
          myVote: voters.includes(me.value),
        }
      })
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)),
  )
  const topVotes = computed(() => activities.value[0]?.votes ?? 0)
  const activityVoterCount = computed(() => new Set(activityVotes.value.map((v) => v.user_id)).size)
  const myActivityIds = computed(
    () => new Set(activityVotes.value.filter((v) => v.user_id === me.value).map((v) => v.activity_id)),
  )

  const routesByVenue = computed(() => {
    const map = new Map()
    for (const r of routes.value) {
      if (!map.has(r.venue_id)) map.set(r.venue_id, [])
      map.get(r.venue_id).push(r)
    }
    return map
  })

  const rankedVenues = computed(() => {
    const strategy = hangout.value?.optimization_strategy ?? 'fair'
    const maxTravelSeconds = hangout.value?.max_travel_minutes ? hangout.value.max_travel_minutes * 60 : null
    return rankVenues(venues.value, strategy, { maxTravelSeconds })
  })

  const voteCounts = computed(() => {
    const counts = new Map()
    for (const v of venueVotes.value) counts.set(v.venue_id, (counts.get(v.venue_id) ?? 0) + 1)
    return counts
  })
  const myVenueVote = computed(() => venueVotes.value.find((v) => v.user_id === me.value)?.venue_id ?? null)
  const leaderVenueId = computed(() => {
    let best = null
    for (const [venueId, count] of voteCounts.value) {
      if (!best || count > best.count) best = { venueId, count, tie: false }
      else if (count === best.count) best.tie = true
    }
    return best && !best.tie ? best.venueId : null
  })
  const selectedVenue = computed(
    () => venues.value.find((v) => v.id === hangout.value?.selected_venue_id) ?? null,
  )

  /** Progress for the stepper and dashboard. */
  const steps = computed(() => {
    const h = hangout.value
    if (!h) return {}
    const finalized = h.status === 'finalized'
    return {
      locations: {
        done: participants.value.length >= 2,
        detail: `${participants.value.length} of ${people.value.length} shared`,
      },
      activities: {
        done: activities.value.length > 0,
        detail: activities.value.length ? `${activities.value.length} on the shortlist` : 'Nothing picked yet',
      },
      meeting: {
        done: !!h.last_calculated_at,
        detail: h.last_calculated_at ? (isStale.value ? 'Inputs changed' : 'Calculated') : 'Not calculated',
      },
      venues: { done: venues.value.length > 0, detail: venues.value.length ? `${venues.value.length} venues` : '—' },
      vote: {
        done: finalized,
        detail: `${venueVotes.value.length} of ${people.value.length} voted`,
      },
      final: { done: finalized, detail: finalized ? selectedVenue.value?.name ?? 'Chosen' : 'Not yet' },
    }
  })

  // -------------------------------------------------------------------
  // Loading and Realtime
  // -------------------------------------------------------------------
  async function loadHangout(id) {
    const h = await api.getHangout(id)
    if (!h) throw new AppError('not_found')
    if (hangoutId.value === id) hangout.value = h
    return h
  }
  const loadMembers = async (groupId) => (members.value = await listMembers(groupId))
  const loadLocations = async (id) => (locations.value = await api.listHangoutLocations(id))
  async function loadActivities(id) {
    const [s, v] = await Promise.all([api.listHangoutActivities(id), api.listActivityVotes(id)])
    shortlist.value = s
    activityVotes.value = v
  }
  async function loadVenues(id) {
    const [v, r] = await Promise.all([api.listVenues(id), api.listVenueRoutes(id)])
    venues.value = v
    routes.value = r
  }
  const loadVenueVotes = async (id) => (venueVotes.value = await api.listVenueVotes(id))
  const loadRun = async (id) => (run.value = await api.getLatestRun(id))

  async function open(id) {
    if (hangoutId.value === id && hangout.value) return
    close()
    hangoutId.value = id
    loading.value = true
    error.value = null
    try {
      const h = await loadHangout(id)
      await Promise.all([
        loadMembers(h.group_id),
        loadLocations(id),
        loadActivities(id),
        loadVenues(id),
        loadVenueVotes(id),
        loadRun(id),
        api.listActivityCatalogue().then((c) => (catalogue.value = c)),
      ])
      if (hangoutId.value === id) listen(id, h.group_id)
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      loading.value = false
    }
  }

  function guarded(fn) {
    return debounce(async () => {
      const id = hangoutId.value
      if (!id) return
      try {
        await fn(id)
      } catch (e) {
        if (AppError.from(e).code === 'not_found') error.value = AppError.from(e)
      }
    }, 250)
  }

  const reloaders = {
    hangouts: guarded(loadHangout),
    group_members: guarded(() => loadMembers(hangout.value.group_id)),
    hangout_locations: guarded(loadLocations),
    hangout_activities: guarded(loadActivities),
    activity_votes: guarded(loadActivities),
    venues: guarded(loadVenues),
    venue_votes: guarded(loadVenueVotes),
    calculation_runs: guarded(loadRun),
  }

  const localIds = {
    hangouts: () => [hangout.value?.id],
    group_members: () => members.value.map((m) => m.id),
    hangout_locations: () => locations.value.map((l) => l.id),
    hangout_activities: () => shortlist.value.map((s) => s.id),
    activity_votes: () => activityVotes.value.map((v) => v.id),
    venues: () => venues.value.map((v) => v.id),
    venue_votes: () => venueVotes.value.map((v) => v.id),
    calculation_runs: () => [run.value?.id],
  }

  function listen(id, groupId) {
    const byHangout = `hangout_id=eq.${id}`
    stop = subscribe(
      'hangout',
      [
        { table: 'hangouts', filter: `id=eq.${id}` },
        { table: 'group_members', filter: `group_id=eq.${groupId}` },
        { table: 'hangout_locations', filter: byHangout },
        { table: 'hangout_activities', filter: byHangout },
        { table: 'activity_votes', filter: byHangout },
        { table: 'venues', filter: byHangout },
        { table: 'venue_votes', filter: byHangout },
        { table: 'calculation_runs', filter: byHangout },
      ],
      ({ table, event, payload }) => {
        if (event === 'DELETE' && !localIds[table]?.().includes(payload.old?.id)) return
        reloaders[table]?.()
      },
    )
  }

  function close() {
    stop?.()
    stop = null
    Object.values(reloaders).forEach((r) => r.cancel())
    hangoutId.value = null
    hangout.value = null
    members.value = []
    locations.value = []
    shortlist.value = []
    activityVotes.value = []
    venues.value = []
    routes.value = []
    venueVotes.value = []
    run.value = null
    error.value = null
    calculating.value = false
  }

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------
  const id = () => hangoutId.value

  async function updateSettings(patch) {
    hangout.value = { ...hangout.value, ...(await api.updateHangout(id(), patch)) }
  }

  async function setStatus(status, votingDeadline = null) {
    const row = await api.setHangoutStatus(id(), status, votingDeadline)
    hangout.value = { ...hangout.value, ...row }
  }

  async function shareLocation(share) {
    await api.shareLocation(id(), share)
    await Promise.all([loadLocations(id()), loadHangout(id())])
  }

  async function stopSharing() {
    await api.stopSharingLocation(id())
    await Promise.all([loadLocations(id()), loadVenues(id())])
  }

  async function toggleActivity(activityId, vote) {
    const before = activityVotes.value
    const hadShortlist = shortlist.value
    // Optimistic: reflect the vote immediately.
    if (vote) {
      activityVotes.value = [...before, { id: `tmp-${activityId}`, activity_id: activityId, user_id: me.value }]
      if (!shortlist.value.some((s) => s.activity_id === activityId)) {
        const activity = catalogue.value.find((a) => a.id === activityId)
        if (activity) {
          shortlist.value = [...shortlist.value, { id: `tmp-${activityId}`, activity_id: activityId, created_by: me.value, activity }]
        }
      }
    } else {
      activityVotes.value = before.filter((v) => !(v.activity_id === activityId && v.user_id === me.value))
    }
    try {
      await api.toggleActivityVote(id(), activityId, vote)
      await loadActivities(id())
    } catch (e) {
      activityVotes.value = before
      shortlist.value = hadShortlist
      throw e
    }
  }

  async function addCustomActivity(name) {
    await api.addCustomActivity(id(), name)
    await loadActivities(id())
  }

  async function removeActivity(activityId) {
    await api.removeHangoutActivity(id(), activityId)
    await loadActivities(id())
  }

  async function calculate({ force = false } = {}) {
    calculating.value = true
    try {
      const result = await computeMeetup(id(), { force })
      await Promise.all([loadHangout(id()), loadVenues(id()), loadRun(id())])
      return result
    } finally {
      calculating.value = false
      loadHangout(id()).catch(() => {})
      loadRun(id()).catch(() => {})
    }
  }

  async function vote(venueId) {
    const before = venueVotes.value
    venueVotes.value = [
      ...before.filter((v) => v.user_id !== me.value),
      { id: `tmp-${venueId}`, venue_id: venueId, user_id: me.value },
    ]
    try {
      await api.castVenueVote(id(), venueId)
      await loadVenueVotes(id())
    } catch (e) {
      venueVotes.value = before
      throw e
    }
  }

  async function clearVote() {
    const before = venueVotes.value
    venueVotes.value = before.filter((v) => v.user_id !== me.value)
    try {
      await api.clearVenueVote(id())
    } catch (e) {
      venueVotes.value = before
      throw e
    }
  }

  async function finalize(venueId) {
    const row = await api.finalizeHangout(id(), venueId)
    hangout.value = { ...hangout.value, ...row }
  }

  /** Fetch drawn routes for a venue (and refresh purged Google details). */
  async function loadRoutes(venueId, { refresh = false } = {}) {
    const existing = routes.value.filter((r) => r.venue_id === venueId)
    const haveAll =
      participants.value.length > 0 &&
      participants.value.every((p) => existing.some((r) => r.user_id === p.userId && (r.polyline || r.travel_time_seconds == null)))
    // Every drawable route is already here: no need to call the function.
    if (haveAll && !refresh) return { routes: [] , cached: true }
    const result = await fetchVenueRoutes(venueId, { refresh })
    if (result?.routes) {
      const others = routes.value.filter((r) => r.venue_id !== venueId)
      const existing = routes.value.filter((r) => r.venue_id === venueId)
      const merged = result.routes.map((r) => {
        const prev = existing.find((e) => e.user_id === r.userId) ?? {}
        return {
          ...prev,
          venue_id: venueId,
          user_id: r.userId,
          travel_time_seconds: r.durationSeconds ?? prev.travel_time_seconds ?? null,
          distance_meters: r.distanceMeters ?? prev.distance_meters ?? null,
          polyline: r.polyline ?? null,
          condition: r.polyline ? 'ROUTE_EXISTS' : prev.condition ?? 'ROUTE_NOT_FOUND',
        }
      })
      routes.value = [...others, ...merged]
    }
    if (result?.venue) {
      venues.value = venues.value.map((v) => (v.id === venueId ? { ...v, ...result.venue } : v))
    }
    return result
  }

  async function remove() {
    await api.deleteHangout(id())
  }

  return {
    hangoutId,
    hangout,
    members,
    locations,
    catalogue,
    shortlist,
    activityVotes,
    venues,
    routes,
    venueVotes,
    run,
    loading,
    error,
    calculating,
    me,
    myMember,
    canManage,
    isOpen,
    isStale,
    people,
    personById,
    participants,
    waitingOn,
    myLocation,
    activities,
    topVotes,
    activityVoterCount,
    myActivityIds,
    routesByVenue,
    rankedVenues,
    voteCounts,
    myVenueVote,
    leaderVenueId,
    selectedVenue,
    steps,
    open,
    close,
    updateSettings,
    setStatus,
    shareLocation,
    stopSharing,
    toggleActivity,
    addCustomActivity,
    removeActivity,
    calculate,
    vote,
    clearVote,
    finalize,
    loadRoutes,
    remove,
  }
})
