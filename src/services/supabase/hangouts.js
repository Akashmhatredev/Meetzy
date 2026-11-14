import { supabase, unwrap } from './client'

export const HANGOUT_COLUMNS = `id, group_id, title, notes, scheduled_for, status, optimization_strategy, travel_mode,
  activity_mode, max_travel_minutes, voting_deadline, created_by, selected_venue_id, meeting_point_lat,
  meeting_point_lng, last_run_id, last_calculated_at, inputs_changed_at, finalized_at, finalized_by,
  cancelled_at, created_at, updated_at`

export const VENUE_COLUMNS = `id, hangout_id, run_id, activity_id, google_place_id, name, address, latitude, longitude,
  rating, rating_count, price_level, primary_type, primary_type_label, google_maps_uri, photo_uri,
  photo_attributions, opening_hours, open_now, business_status, distance_from_area_m, rank,
  avg_travel_seconds, max_travel_seconds, min_travel_seconds, total_travel_seconds, spread_seconds,
  reachable_count, participant_count, routes_complete, within_limit, explanation, content_expires_at`

const GROUP_BRIEF = 'group:groups(id, name, avatar_emoji, avatar_url, color)'

export async function listRecentHangouts(limit = 12) {
  return unwrap(
    await supabase()
      .from('hangouts')
      .select(
        `${HANGOUT_COLUMNS}, ${GROUP_BRIEF},
         selected_venue:venues!hangouts_selected_venue_id_fkey(id, name, address)`,
      )
      .order('updated_at', { ascending: false })
      .limit(limit),
  )
}

export async function listGroupHangouts(groupId) {
  return unwrap(
    await supabase()
      .from('hangouts')
      .select(`${HANGOUT_COLUMNS}, selected_venue:venues!hangouts_selected_venue_id_fkey(id, name)`)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
  )
}

export async function getHangout(hangoutId) {
  return unwrap(
    await supabase().from('hangouts').select(`${HANGOUT_COLUMNS}, ${GROUP_BRIEF}`).eq('id', hangoutId).maybeSingle(),
  )
}

export async function createHangout(groupId, input) {
  return unwrap(
    await supabase().rpc('create_hangout', {
      p_group_id: groupId,
      p_title: input.title,
      p_notes: input.notes || null,
      p_scheduled_for: input.scheduledFor || null,
      p_travel_mode: input.travelMode,
      p_strategy: input.strategy,
      p_activity_mode: input.activityMode,
      p_max_travel_minutes: input.maxTravelMinutes || null,
    }),
  )
}

const EDITABLE = [
  'title',
  'notes',
  'scheduled_for',
  'optimization_strategy',
  'travel_mode',
  'activity_mode',
  'max_travel_minutes',
  'voting_deadline',
]

export async function updateHangout(hangoutId, patch) {
  const allowed = {}
  for (const key of EDITABLE) if (key in patch) allowed[key] = patch[key]
  return unwrap(
    await supabase().from('hangouts').update(allowed).eq('id', hangoutId).select(HANGOUT_COLUMNS).single(),
  )
}

export async function setHangoutStatus(hangoutId, status, votingDeadline = null) {
  return unwrap(
    await supabase().rpc('set_hangout_status', {
      p_hangout_id: hangoutId,
      p_status: status,
      p_voting_deadline: votingDeadline,
    }),
  )
}

export async function deleteHangout(hangoutId) {
  unwrap(await supabase().from('hangouts').delete().eq('id', hangoutId))
}

// ---------------------------------------------------------------------
// Location shares
// ---------------------------------------------------------------------
export async function listHangoutLocations(hangoutId) {
  return unwrap(
    await supabase()
      .from('hangout_locations')
      .select('id, hangout_id, user_id, latitude, longitude, formatted_address, label, source, consented_at, updated_at')
      .eq('hangout_id', hangoutId),
  )
}

export async function shareLocation(hangoutId, share) {
  return unwrap(
    await supabase().rpc('share_hangout_location', {
      p_hangout_id: hangoutId,
      p_source: share.source,
      p_saved_location_id: share.savedLocationId ?? null,
      p_latitude: share.latitude ?? null,
      p_longitude: share.longitude ?? null,
      p_address: share.address ?? null,
      p_label: share.label ?? null,
    }),
  )
}

export async function stopSharingLocation(hangoutId) {
  unwrap(await supabase().rpc('stop_sharing_hangout_location', { p_hangout_id: hangoutId }))
}

// ---------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------
let cataloguePromise = null
export function listActivityCatalogue() {
  cataloguePromise ??= supabase()
    .from('activities')
    .select('id, slug, name, category, icon, places_query, sort_order, is_custom, hangout_id')
    .is('hangout_id', null)
    .order('sort_order')
    .then(unwrap)
    .catch((error) => {
      cataloguePromise = null
      throw error
    })
  return cataloguePromise
}

export async function listHangoutActivities(hangoutId) {
  return unwrap(
    await supabase()
      .from('hangout_activities')
      .select('id, activity_id, created_by, created_at, activity:activities(id, slug, name, category, icon, is_custom)')
      .eq('hangout_id', hangoutId),
  )
}

export async function listActivityVotes(hangoutId) {
  return unwrap(
    await supabase().from('activity_votes').select('id, activity_id, user_id').eq('hangout_id', hangoutId),
  )
}

export async function toggleActivityVote(hangoutId, activityId, vote) {
  unwrap(
    await supabase().rpc('toggle_activity_vote', {
      p_hangout_id: hangoutId,
      p_activity_id: activityId,
      p_vote: vote,
    }),
  )
}

export async function addCustomActivity(hangoutId, name) {
  return unwrap(await supabase().rpc('add_custom_activity', { p_hangout_id: hangoutId, p_name: name }))
}

export async function removeHangoutActivity(hangoutId, activityId) {
  unwrap(
    await supabase().rpc('remove_hangout_activity', { p_hangout_id: hangoutId, p_activity_id: activityId }),
  )
}

// ---------------------------------------------------------------------
// Engine results, venues and votes
// ---------------------------------------------------------------------
export async function getLatestRun(hangoutId) {
  return unwrap(
    await supabase()
      .from('calculation_runs')
      .select(
        `id, status, strategy, travel_mode, participant_count, center_lat, center_lng, area_lat, area_lng, area_kind,
         area_metrics, activities_used, venues_considered, routes_requested, routes_failed, warnings, error_code,
         error_message, started_at, finished_at`,
      )
      .eq('hangout_id', hangoutId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
}

export async function listVenues(hangoutId) {
  return unwrap(
    await supabase().from('venues').select(VENUE_COLUMNS).eq('hangout_id', hangoutId).order('rank'),
  )
}

export async function listVenueRoutes(hangoutId) {
  return unwrap(
    await supabase()
      .from('venue_routes')
      .select('id, venue_id, user_id, travel_mode, travel_time_seconds, distance_meters, condition, polyline')
      .eq('hangout_id', hangoutId),
  )
}

export async function listVenueVotes(hangoutId) {
  return unwrap(
    await supabase().from('venue_votes').select('id, venue_id, user_id, updated_at').eq('hangout_id', hangoutId),
  )
}

export async function castVenueVote(hangoutId, venueId) {
  return unwrap(await supabase().rpc('cast_venue_vote', { p_hangout_id: hangoutId, p_venue_id: venueId }))
}

export async function clearVenueVote(hangoutId) {
  unwrap(await supabase().rpc('clear_venue_vote', { p_hangout_id: hangoutId }))
}

export async function finalizeHangout(hangoutId, venueId) {
  return unwrap(await supabase().rpc('finalize_hangout', { p_hangout_id: hangoutId, p_venue_id: venueId }))
}
