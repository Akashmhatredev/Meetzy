/** Shared helpers for the database tests. */
import assert from 'node:assert/strict'

export { assert }

/** Await a promise that must reject; the error message must match pattern. */
export async function rejects(promise, pattern) {
  let error
  try {
    await promise
  } catch (e) {
    error = e
  }
  if (!error) throw new assert.AssertionError({ message: `expected an error matching ${pattern}, but it succeeded` })
  if (pattern && !pattern.test(error.message)) {
    throw new assert.AssertionError({
      message: `expected an error matching ${pattern}, got: ${error.message}`,
    })
  }
  return error
}

/** Query as a user (null = anon) and return rows. */
export function q(h, userId, sql, params = []) {
  return h.as(userId, async (db) => (await db.query(sql, params)).rows)
}

/** Query as superuser (setup and inspection). */
export async function su(h, sql, params = []) {
  return (await h.db.query(sql, params)).rows
}

/** Query as the service role (Edge Functions). */
export function svc(h, sql, params = []) {
  return h.asService(async (db) => (await db.query(sql, params)).rows)
}

export async function createGroup(h, ownerId, name = 'Weekend Squad') {
  const [group] = await q(h, ownerId, 'select * from public.create_group($1, $2, $3, $4)', [
    name,
    'Test group',
    '🎉',
    'mint',
  ])
  return group
}

export async function createInvite(h, userId, groupId, hours = 168, maxUses = null) {
  const [invite] = await q(h, userId, 'select * from public.create_group_invitation($1, $2, $3)', [
    groupId,
    hours,
    maxUses,
  ])
  return invite
}

export async function join(h, userId, code) {
  const [row] = await q(h, userId, 'select public.join_group_with_code($1) as result', [code])
  return row.result
}

/** Create a group owned by the first user and add the rest as members. */
export async function groupWith(h, ownerId, memberIds = [], name) {
  const group = await createGroup(h, ownerId, name)
  if (memberIds.length) {
    const invite = await createInvite(h, ownerId, group.id)
    for (const id of memberIds) {
      const result = await join(h, id, invite.invite_code)
      assert.equal(result.status, 'joined')
    }
  }
  return group
}

export async function createHangout(h, userId, groupId, title = 'Friday night', opts = {}) {
  const [row] = await q(
    h,
    userId,
    'select * from public.create_hangout($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      groupId,
      title,
      opts.notes ?? null,
      opts.scheduledFor ?? null,
      opts.travelMode ?? 'DRIVE',
      opts.strategy ?? 'fair',
      opts.activityMode ?? 'all_selected',
      opts.maxTravelMinutes ?? null,
    ],
  )
  return row
}

export async function saveLocation(h, userId, name = 'Home', lat = 18.52, lng = 73.85, extra = {}) {
  const [row] = await q(
    h,
    userId,
    `insert into public.user_locations (location_name, latitude, longitude, formatted_address, is_primary)
     values ($1, $2, $3, $4, $5) returning *`,
    [name, lat, lng, extra.address ?? `${name} address`, extra.isPrimary ?? false],
  )
  return row
}

export async function shareManual(h, userId, hangoutId, lat = 18.5, lng = 73.8, source = 'manual') {
  const [row] = await q(
    h,
    userId,
    'select * from public.share_hangout_location($1, $2, null, $3, $4, $5, null)',
    [hangoutId, source, lat, lng, 'Somewhere in Pune'],
  )
  return row
}

export async function activityId(h, slug) {
  const [row] = await su(h, 'select id from public.activities where slug = $1', [slug])
  return row.id
}

/** A realistic complete_calculation payload, following the Edge Function contract. */
export function resultPayload(userIds, venues = defaultVenues(), extra = {}) {
  return {
    center: { lat: 18.53, lng: 73.86 },
    area: { lat: 18.531, lng: 73.861, kind: 'median' },
    areas: [
      { lat: 18.531, lng: 73.861, kind: 'median', avg: 1200, max: 1500, total: 2400, complete: true },
      { lat: 18.53, lng: 73.86, kind: 'centroid', avg: 1300, max: 1700, total: 2600, complete: true },
    ],
    activitiesUsed: [{ id: null, name: 'Cafe' }],
    venuesConsidered: venues.length,
    routesRequested: venues.length * userIds.length,
    routesFailed: 0,
    warnings: [],
    venues: venues.map((v, i) => ({
      placeId: v.placeId,
      name: v.name,
      address: `${v.name} street, Pune`,
      lat: 18.53 + i * 0.001,
      lng: 73.86 + i * 0.001,
      rating: 4.4,
      ratingCount: 812,
      priceLevel: 'PRICE_LEVEL_MODERATE',
      primaryType: 'cafe',
      primaryTypeLabel: 'Cafe',
      activityId: v.activityId ?? null,
      googleMapsUri: `https://maps.google.com/?cid=${i + 1}`,
      photoUri: null,
      photoAttributions: [],
      openingHours: ['Monday: 9:00 AM – 11:00 PM'],
      openNow: true,
      businessStatus: 'OPERATIONAL',
      distanceFromAreaMeters: 300 + i * 100,
      rank: i + 1,
      summary: {
        avg: 1200 + i * 60,
        max: 1500 + i * 60,
        min: 900,
        total: (1200 + i * 60) * userIds.length,
        spread: 600,
        reachable: userIds.length,
        participants: userIds.length,
        complete: true,
        withinLimit: true,
      },
      explanation: `Everyone can reach ${v.name} within about 25 minutes.`,
      routes: userIds.map((userId, j) => ({
        userId,
        durationSeconds: 900 + j * 600,
        distanceMeters: 5000 + j * 3000,
        condition: 'ROUTE_EXISTS',
      })),
    })),
    ...extra,
  }
}

export function defaultVenues() {
  return [
    { placeId: 'ChIJ_place_one', name: 'Blue Tokai' },
    { placeId: 'ChIJ_place_two', name: 'Third Wave' },
  ]
}

/** Drive a hangout through start + complete as the service role. Returns run id. */
export async function runCalculation(h, hangoutId, userId, userIds, venues, hash = 'hash-1') {
  const [{ result }] = await svc(h, 'select public.start_calculation($1, $2, $3, true, $4) as result', [
    hangoutId,
    userId,
    hash,
    userIds.length,
  ])
  await svc(h, 'select public.complete_calculation($1, $2)', [
    result.run_id,
    JSON.stringify(resultPayload(userIds, venues)),
  ])
  return result.run_id
}
