import {
  assert,
  rejects,
  q,
  su,
  svc,
  groupWith,
  createHangout,
  shareManual,
  resultPayload,
  runCalculation,
} from './helpers.mjs'

const ctx = {}

const start = (h, hangoutId, userId, hash, force = false, count = 2) =>
  svc(h, 'select public.start_calculation($1, $2, $3, $4, $5) as r', [hangoutId, userId, hash, force, count]).then(
    (rows) => rows[0].r,
  )
const complete = (h, runId, payload) =>
  svc(h, 'select public.complete_calculation($1, $2) as r', [runId, JSON.stringify(payload)]).then((rows) => rows[0].r)
const fail = (h, runId, code = 'google_error', message = 'Routes API returned 500') =>
  svc(h, 'select public.fail_calculation($1, $2, $3)', [runId, code, message])
const status = async (h, hangoutId) =>
  (await su(h, 'select status from public.hangouts where id = $1', [hangoutId]))[0].status
const vote = (h, userId, hangoutId, venueId) =>
  q(h, userId, 'select * from public.cast_venue_vote($1, $2)', [hangoutId, venueId]).then((rows) => rows[0])

export const tests = [
  {
    name: 'API users cannot run or forge engine results',
    async fn(h) {
      ctx.olga = await h.createUser('Olga Organiser')
      ctx.mo = await h.createUser('Mo Member')
      ctx.nia = await h.createUser('Nia Member')
      ctx.sid = await h.createUser('Sid Stranger')
      ctx.group = await groupWith(h, ctx.olga, [ctx.mo, ctx.nia])
      ctx.hangout = await createHangout(h, ctx.olga, ctx.group.id, 'Friday dinner', { travelMode: 'TWO_WHEELER' })
      await shareManual(h, ctx.olga, ctx.hangout.id, 18.52, 73.85)
      await shareManual(h, ctx.mo, ctx.hangout.id, 18.6, 73.75)

      const forbidden = [
        ['select public.start_calculation($1, $2, $3)', [ctx.hangout.id, ctx.mo, 'h']],
        ['select public.complete_calculation($1, $2)', [ctx.hangout.id, '{}']],
        ['select public.fail_calculation($1, $2, $3)', [ctx.hangout.id, 'x', 'y']],
        ['select public.purge_expired_google_content()', []],
      ]
      for (const [sql, params] of forbidden) {
        await rejects(q(h, ctx.mo, sql, params), /permission denied/)
      }
      await rejects(
        q(h, ctx.mo, "insert into public.venues (hangout_id, google_place_id, name) values ($1, 'x', 'Fake')", [
          ctx.hangout.id,
        ]),
        /permission denied/,
      )
      await rejects(
        q(
          h,
          ctx.mo,
          "insert into public.calculation_runs (hangout_id, input_hash, strategy, travel_mode) values ($1, 'x', 'fair', 'DRIVE')",
          [ctx.hangout.id],
        ),
        /permission denied/,
      )
    },
  },
  {
    name: 'start_calculation checks membership and marks the hangout calculating',
    async fn(h) {
      await rejects(start(h, ctx.hangout.id, ctx.sid, 'hash-1'), /not_found/)
      const r = await start(h, ctx.hangout.id, ctx.mo, 'hash-1')
      assert.equal(r.cached, false)
      assert.ok(r.run_id)
      ctx.run1 = r.run_id
      assert.equal(await status(h, ctx.hangout.id), 'calculating')
      const [run] = await su(h, 'select * from public.calculation_runs where id = $1', [ctx.run1])
      assert.equal(run.status, 'running')
      assert.equal(run.requested_by, ctx.mo)
      assert.equal(run.previous_status, 'waiting_for_locations')
      assert.equal(run.travel_mode, 'TWO_WHEELER')
      assert.equal(run.strategy, 'fair')
      assert.equal(run.participant_count, 2)
      // Members can see the run in progress.
      assert.equal((await q(h, ctx.nia, 'select id from public.calculation_runs')).length, 1)
      assert.equal((await q(h, ctx.sid, 'select id from public.calculation_runs')).length, 0)
    },
  },
  {
    name: 'only one calculation runs at a time',
    async fn(h) {
      await rejects(start(h, ctx.hangout.id, ctx.olga, 'hash-1', true), /already_running/)
      await rejects(
        q(h, ctx.olga, "select public.set_hangout_status($1, 'activity_selection')", [ctx.hangout.id]),
        /calculation_running/,
      )
    },
  },
  {
    name: 'complete_calculation stores venues, routes and the meeting point',
    async fn(h) {
      const payload = resultPayload([ctx.olga, ctx.mo])
      const r = await complete(h, ctx.run1, payload)
      assert.deepEqual(r, { venue_count: 2 })

      const [hangout] = await su(h, 'select * from public.hangouts where id = $1', [ctx.hangout.id])
      assert.equal(hangout.status, 'venue_discovery')
      assert.equal(hangout.last_run_id, ctx.run1)
      assert.equal(hangout.meeting_point_lat, 18.531)
      assert.equal(hangout.meeting_point_lng, 73.861)
      assert.ok(hangout.last_calculated_at)
      assert.equal(hangout.inputs_changed_at, null)

      const [run] = await su(h, 'select * from public.calculation_runs where id = $1', [ctx.run1])
      assert.equal(run.status, 'succeeded')
      assert.equal(run.area_kind, 'median')
      assert.equal(run.center_lat, 18.53)
      assert.equal(run.venues_considered, 2)
      assert.equal(run.routes_requested, 4)
      assert.equal(run.area_metrics.length, 2)
      const days = (new Date(run.content_expires_at) - Date.now()) / 864e5
      assert.ok(days > 29.9 && days < 30.1, `expiry should be ~30 days, got ${days}`)

      const venues = await q(
        h,
        ctx.nia,
        'select * from public.venues where hangout_id = $1 order by rank',
        [ctx.hangout.id],
      )
      assert.equal(venues.length, 2)
      const [v1] = venues
      assert.equal(v1.name, 'Blue Tokai')
      assert.equal(v1.google_place_id, 'ChIJ_place_one')
      assert.equal(Number(v1.rating), 4.4)
      assert.equal(v1.rating_count, 812)
      assert.equal(v1.avg_travel_seconds, 1200)
      assert.equal(v1.max_travel_seconds, 1500)
      assert.equal(v1.total_travel_seconds, 2400)
      assert.equal(v1.reachable_count, 2)
      assert.equal(v1.routes_complete, true)
      assert.equal(v1.within_limit, true)
      assert.equal(v1.run_id, ctx.run1)
      assert.deepEqual(v1.opening_hours, ['Monday: 9:00 AM – 11:00 PM'])
      assert.match(v1.explanation, /within about 25 minutes/)
      ctx.venues = venues

      const routes = await q(
        h,
        ctx.nia,
        'select user_id, travel_mode, travel_time_seconds, distance_meters from public.venue_routes where venue_id = $1 order by travel_time_seconds',
        [v1.id],
      )
      assert.deepEqual(routes, [
        { user_id: ctx.olga, travel_mode: 'TWO_WHEELER', travel_time_seconds: 900, distance_meters: 5000 },
        { user_id: ctx.mo, travel_mode: 'TWO_WHEELER', travel_time_seconds: 1500, distance_meters: 8000 },
      ])
      assert.equal((await q(h, ctx.sid, 'select id from public.venues')).length, 0)
      assert.equal((await q(h, ctx.sid, 'select id from public.venue_routes')).length, 0)
    },
  },
  {
    name: 'a finished run cannot be completed or failed again',
    async fn(h) {
      await rejects(complete(h, ctx.run1, resultPayload([ctx.olga])), /invalid_run/)
      await fail(h, ctx.run1)
      const [run] = await su(h, 'select status from public.calculation_runs where id = $1', [ctx.run1])
      assert.equal(run.status, 'succeeded')
    },
  },
  {
    name: 'an identical request reuses the last run without calling Google again',
    async fn(h) {
      const r = await start(h, ctx.hangout.id, ctx.nia, 'hash-1', false)
      assert.deepEqual(r, { cached: true, run_id: ctx.run1 })
      assert.equal(await status(h, ctx.hangout.id), 'venue_discovery')
      // Forcing, or new inputs, starts a fresh run.
      const forced = await start(h, ctx.hangout.id, ctx.nia, 'hash-1', true)
      assert.equal(forced.cached, false)
      ctx.run2 = forced.run_id
    },
  },
  {
    name: 'fail_calculation restores the previous status and records the error',
    async fn(h) {
      await fail(h, ctx.run2, 'google_error', 'Routes API returned 500')
      assert.equal(await status(h, ctx.hangout.id), 'venue_discovery')
      const [run] = await su(h, 'select status, error_code, error_message from public.calculation_runs where id = $1', [
        ctx.run2,
      ])
      assert.deepEqual(run, { status: 'failed', error_code: 'google_error', error_message: 'Routes API returned 500' })
      // A failed run is never served from the cache.
      const r = await start(h, ctx.hangout.id, ctx.nia, 'hash-2', false)
      assert.equal(r.cached, false)
      ctx.run3 = r.run_id
    },
  },
  {
    name: 'a run that never reports back times out after two minutes',
    async fn(h) {
      await su(h, "update public.calculation_runs set started_at = now() - interval '3 minutes' where id = $1", [
        ctx.run3,
      ])
      const r = await start(h, ctx.hangout.id, ctx.olga, 'hash-3', true)
      assert.equal(r.cached, false)
      const [old] = await su(h, 'select status, error_code from public.calculation_runs where id = $1', [ctx.run3])
      assert.deepEqual(old, { status: 'failed', error_code: 'timeout' })
      const [newRun] = await su(h, 'select previous_status from public.calculation_runs where id = $1', [r.run_id])
      assert.equal(newRun.previous_status, 'venue_discovery')
      await fail(h, r.run_id)
      assert.equal(await status(h, ctx.hangout.id), 'venue_discovery')
    },
  },
  {
    name: 'calculations are rate limited per user',
    async fn(h) {
      // Nia already started two runs this hour (one cached call did not count).
      for (let i = 0; i < 6; i++) {
        const r = await start(h, ctx.hangout.id, ctx.nia, `rate-${i}`, true)
        await fail(h, r.run_id)
      }
      const error = await rejects(start(h, ctx.hangout.id, ctx.nia, 'rate-x', true), /rate_limited/)
      assert.match(error.detail, /Try again/)
      assert.equal(await status(h, ctx.hangout.id), 'venue_discovery')
    },
  },
  {
    name: 'members cast, change and clear one venue vote each',
    async fn(h) {
      const [v1, v2] = ctx.venues
      const first = await vote(h, ctx.mo, ctx.hangout.id, v1.id)
      assert.equal(first.venue_id, v1.id)
      const changed = await vote(h, ctx.mo, ctx.hangout.id, v2.id)
      assert.equal(changed.id, first.id, 'changing a vote updates the same row')
      assert.equal(changed.venue_id, v2.id)
      await vote(h, ctx.olga, ctx.hangout.id, v1.id)
      await vote(h, ctx.nia, ctx.hangout.id, v1.id)
      await q(h, ctx.nia, 'select public.clear_venue_vote($1)', [ctx.hangout.id])
      const votes = await q(h, ctx.nia, 'select user_id, venue_id from public.venue_votes where hangout_id = $1', [
        ctx.hangout.id,
      ])
      assert.equal(votes.length, 2)
      assert.deepEqual(
        Object.fromEntries(votes.map((v) => [v.user_id, v.venue_id])),
        { [ctx.mo]: v2.id, [ctx.olga]: v1.id },
      )
      await rejects(vote(h, ctx.sid, ctx.hangout.id, v1.id), /not_found/)
      await rejects(
        q(h, ctx.mo, 'insert into public.venue_votes (hangout_id, venue_id, user_id) values ($1, $2, $3)', [
          ctx.hangout.id,
          v1.id,
          ctx.mo,
        ]),
        /permission denied/,
      )
    },
  },
  {
    name: 'votes must target a venue of the same hangout',
    async fn(h) {
      const other = await createHangout(h, ctx.olga, ctx.group.id, 'Other plan')
      await shareManual(h, ctx.olga, other.id)
      await runCalculation(h, other.id, ctx.olga, [ctx.olga], [{ placeId: 'ChIJ_other', name: 'Elsewhere' }], 'o-1')
      const [elsewhere] = await su(h, 'select id from public.venues where hangout_id = $1', [other.id])
      await rejects(vote(h, ctx.mo, ctx.hangout.id, elsewhere.id), /not_found/)
      ctx.elsewhere = elsewhere.id
      ctx.other = other.id
    },
  },
  {
    name: 'opening voting validates the deadline and notifies members',
    async fn(h) {
      await rejects(
        q(h, ctx.olga, "select public.set_hangout_status($1, 'voting', now() - interval '1 minute')", [ctx.hangout.id]),
        /invalid_deadline/,
      )
      await rejects(
        q(h, ctx.mo, "select public.set_hangout_status($1, 'voting')", [ctx.hangout.id]),
        /forbidden/,
      )
      const [row] = await q(
        h,
        ctx.olga,
        "select * from public.set_hangout_status($1, 'voting', now() + interval '2 hours')",
        [ctx.hangout.id],
      )
      assert.equal(row.status, 'voting')
      assert.ok(row.voting_deadline)
      const notes = await su(
        h,
        "select user_id, link from public.notifications where type = 'voting_open' and hangout_id = $1",
        [ctx.hangout.id],
      )
      assert.deepEqual(new Set(notes.map((n) => n.user_id)), new Set([ctx.mo, ctx.nia]))
      assert.equal(notes[0].link, `/hangouts/${ctx.hangout.id}/vote`)
      await vote(h, ctx.nia, ctx.hangout.id, ctx.venues[0].id)
    },
  },
  {
    name: 'voting closes at the deadline and outside the voting stages',
    async fn(h) {
      await su(h, "update public.hangouts set voting_deadline = now() - interval '1 minute' where id = $1", [
        ctx.hangout.id,
      ])
      await rejects(vote(h, ctx.mo, ctx.hangout.id, ctx.venues[0].id), /voting_closed/)
      await su(h, "update public.hangouts set voting_deadline = null, status = 'activity_selection' where id = $1", [
        ctx.hangout.id,
      ])
      await rejects(vote(h, ctx.mo, ctx.hangout.id, ctx.venues[0].id), /voting_closed/)
      await rejects(q(h, ctx.mo, 'select public.clear_venue_vote($1)', [ctx.hangout.id]), /voting_closed/)
      await su(h, "update public.hangouts set status = 'voting' where id = $1", [ctx.hangout.id])
    },
  },
  {
    name: 'a recalculation keeps votes on venues that stay and the selected venue',
    async fn(h) {
      const [v1, v2] = ctx.venues
      // Simulate a plan pointing at v2 while a recalculation lands.
      await su(h, 'update public.hangouts set selected_venue_id = $2 where id = $1', [ctx.hangout.id, v2.id])
      const r = await start(h, ctx.hangout.id, ctx.olga, 'recalc', true)
      await complete(
        h,
        r.run_id,
        resultPayload(
          [ctx.olga, ctx.mo],
          [
            { placeId: 'ChIJ_place_one', name: 'Blue Tokai' },
            { placeId: 'ChIJ_place_new', name: 'Brand New' },
          ],
        ),
      )
      const venues = await su(h, 'select id, google_place_id, run_id from public.venues where hangout_id = $1', [
        ctx.hangout.id,
      ])
      const byPlace = Object.fromEntries(venues.map((v) => [v.google_place_id, v]))
      assert.equal(byPlace.ChIJ_place_one.id, v1.id, 'kept venues keep their id')
      assert.equal(byPlace.ChIJ_place_one.run_id, r.run_id)
      assert.ok(byPlace.ChIJ_place_new)
      assert.ok(byPlace.ChIJ_place_two, 'the selected venue survives')
      assert.equal(await status(h, ctx.hangout.id), 'voting', 'a recalculation during voting stays in voting')

      const votes = await su(h, 'select user_id, venue_id from public.venue_votes where hangout_id = $1', [
        ctx.hangout.id,
      ])
      assert.ok(votes.some((v) => v.user_id === ctx.olga && v.venue_id === v1.id), 'votes on kept venues survive')

      // Without the plan pointing at it, a dropped venue and its votes go away.
      await su(h, 'update public.hangouts set selected_venue_id = null where id = $1', [ctx.hangout.id])
      await vote(h, ctx.mo, ctx.hangout.id, byPlace.ChIJ_place_new.id)
      const r2 = await start(h, ctx.hangout.id, ctx.olga, 'recalc-2', true)
      await complete(h, r2.run_id, resultPayload([ctx.olga, ctx.mo], [{ placeId: 'ChIJ_place_one', name: 'Blue Tokai' }]))
      const left = await su(h, 'select google_place_id from public.venues where hangout_id = $1', [ctx.hangout.id])
      assert.deepEqual(
        left.map((v) => v.google_place_id),
        ['ChIJ_place_one'],
      )
      const moVote = await su(h, 'select id from public.venue_votes where hangout_id = $1 and user_id = $2', [
        ctx.hangout.id,
        ctx.mo,
      ])
      assert.equal(moVote.length, 0)
    },
  },
  {
    name: 'only organisers finalise, members are notified and voting closes',
    async fn(h) {
      const [venue] = await su(h, 'select id, name from public.venues where hangout_id = $1', [ctx.hangout.id])
      await rejects(q(h, ctx.mo, 'select public.finalize_hangout($1, $2)', [ctx.hangout.id, venue.id]), /forbidden/)
      await rejects(
        q(h, ctx.olga, 'select public.finalize_hangout($1, $2)', [ctx.hangout.id, ctx.elsewhere]),
        /not_found/,
      )
      const [row] = await q(h, ctx.olga, 'select * from public.finalize_hangout($1, $2)', [ctx.hangout.id, venue.id])
      assert.equal(row.status, 'finalized')
      assert.equal(row.selected_venue_id, venue.id)
      assert.equal(row.finalized_by, ctx.olga)
      assert.ok(row.finalized_at)
      const notes = await su(
        h,
        "select user_id, title, link from public.notifications where type = 'hangout_finalized' and hangout_id = $1",
        [ctx.hangout.id],
      )
      assert.deepEqual(new Set(notes.map((n) => n.user_id)), new Set([ctx.mo, ctx.nia]))
      assert.match(notes[0].title, /Friday dinner is set: Blue Tokai/)
      assert.equal(notes[0].link, `/hangouts/${ctx.hangout.id}/confirmed`)
      await rejects(vote(h, ctx.mo, ctx.hangout.id, venue.id), /voting_closed/)
      await rejects(start(h, ctx.hangout.id, ctx.olga, 'after-final', true), /hangout_closed/)
      ctx.finalVenue = venue.id
    },
  },
  {
    name: 'reopening a finalised hangout clears the choice',
    async fn(h) {
      const [row] = await q(h, ctx.olga, "select * from public.set_hangout_status($1, 'voting')", [ctx.hangout.id])
      assert.equal(row.status, 'voting')
      assert.equal(row.selected_venue_id, null)
      assert.equal(row.finalized_at, null)
      await q(h, ctx.olga, 'select public.finalize_hangout($1, $2)', [ctx.hangout.id, ctx.finalVenue])
    },
  },
  {
    name: 'expired Google content is purged; the chosen venue keeps only its place id',
    async fn(h) {
      // Add a non-selected venue to the finalised hangout's history.
      await su(
        h,
        "insert into public.venues (hangout_id, google_place_id, name, content_expires_at) values ($1, 'ChIJ_stale', 'Stale', now() - interval '1 day')",
        [ctx.hangout.id],
      )
      await su(h, "update public.venues set content_expires_at = now() - interval '1 day' where id = $1", [
        ctx.finalVenue,
      ])
      await su(h, "update public.calculation_runs set content_expires_at = now() - interval '1 day' where hangout_id = $1", [
        ctx.hangout.id,
      ])
      const [{ r }] = await svc(h, 'select public.purge_expired_google_content() as r')
      assert.equal(r.deleted_venues, 1)
      assert.equal(r.scrubbed_venues, 1)

      const venues = await su(h, 'select * from public.venues where hangout_id = $1', [ctx.hangout.id])
      assert.equal(venues.length, 1)
      const [kept] = venues
      assert.equal(kept.id, ctx.finalVenue)
      assert.equal(kept.google_place_id, 'ChIJ_place_one')
      assert.equal(kept.name, null)
      assert.equal(kept.address, null)
      assert.equal(kept.latitude, null)
      assert.equal(kept.photo_uri, null)
      const routes = await su(h, 'select id from public.venue_routes where venue_id = $1', [ctx.finalVenue])
      assert.equal(routes.length, 0)
      const runs = await su(
        h,
        'select id from public.calculation_runs where hangout_id = $1 and area_metrics is not null',
        [ctx.hangout.id],
      )
      assert.equal(runs.length, 0)
      const [hangout] = await su(h, 'select selected_venue_id from public.hangouts where id = $1', [ctx.hangout.id])
      assert.equal(hangout.selected_venue_id, ctx.finalVenue)
    },
  },
  {
    name: 'withdrawing a location deletes that member\'s routes and flags the results',
    async fn(h) {
      const before = await su(h, 'select id from public.venue_routes where hangout_id = $1 and user_id = $2', [
        ctx.other,
        ctx.olga,
      ])
      assert.equal(before.length, 1)
      await q(h, ctx.olga, 'select public.stop_sharing_hangout_location($1)', [ctx.other])
      const after = await su(h, 'select id from public.venue_routes where hangout_id = $1 and user_id = $2', [
        ctx.other,
        ctx.olga,
      ])
      assert.equal(after.length, 0)
      const [row] = await su(h, 'select inputs_changed_at from public.hangouts where id = $1', [ctx.other])
      assert.ok(row.inputs_changed_at)
    },
  },
]
