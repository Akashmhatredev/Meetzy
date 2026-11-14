import { assert, rejects, q, su, groupWith, createHangout, activityId } from './helpers.mjs'

const ctx = {}

const vote = (h, user, hangoutId, activity, on = true) =>
  q(h, user, 'select public.toggle_activity_vote($1, $2, $3)', [hangoutId, activity, on])

const shortlist = async (h, hangoutId) =>
  su(
    h,
    `select a.slug, a.name, ha.created_by,
            (select count(*)::int from public.activity_votes v
              where v.hangout_id = ha.hangout_id and v.activity_id = ha.activity_id) as votes
       from public.hangout_activities ha join public.activities a on a.id = ha.activity_id
      where ha.hangout_id = $1 order by a.sort_order`,
    [hangoutId],
  )

export const tests = [
  {
    name: 'the catalogue is readable by signed-in users only',
    async fn(h) {
      ctx.amy = await h.createUser('Amy Admin')
      ctx.bo = await h.createUser('Bo Member')
      ctx.cy = await h.createUser('Cy Outsider')
      ctx.group = await groupWith(h, ctx.amy, [ctx.bo])
      ctx.hangout = await createHangout(h, ctx.amy, ctx.group.id, 'Game night')
      const rows = await q(h, ctx.cy, 'select slug, category, places_query from public.activities')
      assert.equal(rows.length, 20)
      assert.ok(rows.every((r) => r.places_query))
      await rejects(q(h, null, 'select id from public.activities'), /permission denied/)
      ctx.cafe = await activityId(h, 'cafe')
      ctx.movies = await activityId(h, 'movies')
    },
  },
  {
    name: 'voting for an activity adds it to the shortlist',
    async fn(h) {
      await vote(h, ctx.amy, ctx.hangout.id, ctx.cafe)
      await vote(h, ctx.amy, ctx.hangout.id, ctx.cafe) // idempotent
      await vote(h, ctx.bo, ctx.hangout.id, ctx.cafe)
      await vote(h, ctx.bo, ctx.hangout.id, ctx.movies)
      const list = await shortlist(h, ctx.hangout.id)
      assert.deepEqual(
        list.map((r) => [r.slug, r.votes, r.created_by]),
        [
          ['cafe', 2, ctx.amy],
          ['movies', 1, ctx.bo],
        ],
      )
      const seen = await q(h, ctx.bo, 'select user_id from public.activity_votes where hangout_id = $1', [
        ctx.hangout.id,
      ])
      assert.equal(seen.length, 3)
    },
  },
  {
    name: 'removing the last vote takes the activity off the shortlist',
    async fn(h) {
      await vote(h, ctx.amy, ctx.hangout.id, ctx.cafe, false)
      let list = await shortlist(h, ctx.hangout.id)
      assert.deepEqual(
        list.map((r) => [r.slug, r.votes]),
        [
          ['cafe', 1],
          ['movies', 1],
        ],
      )
      await vote(h, ctx.bo, ctx.hangout.id, ctx.movies, false)
      list = await shortlist(h, ctx.hangout.id)
      assert.deepEqual(
        list.map((r) => r.slug),
        ['cafe'],
      )
    },
  },
  {
    name: 'outsiders cannot vote or see votes; nobody writes votes directly',
    async fn(h) {
      await rejects(vote(h, ctx.cy, ctx.hangout.id, ctx.cafe), /not_found/)
      assert.equal((await q(h, ctx.cy, 'select id from public.activity_votes')).length, 0)
      assert.equal((await q(h, ctx.cy, 'select id from public.hangout_activities')).length, 0)
      await rejects(
        q(h, ctx.amy, 'insert into public.activity_votes (hangout_id, activity_id, user_id) values ($1, $2, $3)', [
          ctx.hangout.id,
          ctx.cafe,
          ctx.amy,
        ]),
        /permission denied/,
      )
      await rejects(
        q(h, ctx.amy, 'delete from public.activity_votes where hangout_id = $1', [ctx.hangout.id]),
        /permission denied/,
      )
    },
  },
  {
    name: 'custom activities are deduplicated by name and votes count',
    async fn(h) {
      const [first] = await q(h, ctx.bo, 'select * from public.add_custom_activity($1, $2)', [
        ctx.hangout.id,
        '  Karaoke   night ',
      ])
      assert.equal(first.name, 'Karaoke night')
      assert.equal(first.is_custom, true)
      assert.equal(first.category, 'other')
      assert.equal(first.places_query, 'Karaoke night')
      assert.equal(first.hangout_id, ctx.hangout.id)
      const [again] = await q(h, ctx.amy, 'select * from public.add_custom_activity($1, $2)', [
        ctx.hangout.id,
        'karaoke NIGHT',
      ])
      assert.equal(again.id, first.id)
      // A catalogue name resolves to the catalogue activity.
      const [cafe] = await q(h, ctx.amy, 'select * from public.add_custom_activity($1, $2)', [ctx.hangout.id, 'Cafe'])
      assert.equal(cafe.id, ctx.cafe)
      const list = await shortlist(h, ctx.hangout.id)
      const karaoke = list.find((r) => r.name === 'Karaoke night')
      assert.equal(karaoke.votes, 2)
      ctx.karaoke = first.id
      await rejects(
        q(h, ctx.amy, 'select public.add_custom_activity($1, $2)', [ctx.hangout.id, 'x']),
        /invalid_input/,
      )
    },
  },
  {
    name: 'custom activities are visible only to the hangout\'s members and only votable there',
    async fn(h) {
      const outsiderRows = await q(h, ctx.cy, 'select id from public.activities where id = $1', [ctx.karaoke])
      assert.equal(outsiderRows.length, 0)
      const memberRows = await q(h, ctx.amy, 'select id from public.activities where id = $1', [ctx.karaoke])
      assert.equal(memberRows.length, 1)
      const otherHangout = await createHangout(h, ctx.amy, ctx.group.id, 'Another plan')
      await rejects(vote(h, ctx.amy, otherHangout.id, ctx.karaoke), /not_found/)
      ctx.other = otherHangout
    },
  },
  {
    name: 'a hangout can shortlist at most 12 activities',
    async fn(h) {
      const ids = (await su(h, 'select id from public.activities where hangout_id is null order by sort_order')).map(
        (r) => r.id,
      )
      for (const id of ids.slice(0, 12)) await vote(h, ctx.amy, ctx.other.id, id)
      await rejects(vote(h, ctx.amy, ctx.other.id, ids[12]), /activity_limit_reached/)
      // Voting for one already on the list still works at the cap.
      await vote(h, ctx.bo, ctx.other.id, ids[0])
    },
  },
  {
    name: 'only organisers can remove an activity, which drops its votes',
    async fn(h) {
      await rejects(
        q(h, ctx.bo, 'select public.remove_hangout_activity($1, $2)', [ctx.hangout.id, ctx.karaoke]),
        /forbidden/,
      )
      await q(h, ctx.amy, 'select public.remove_hangout_activity($1, $2)', [ctx.hangout.id, ctx.karaoke])
      const votes = await su(h, 'select id from public.activity_votes where activity_id = $1', [ctx.karaoke])
      assert.equal(votes.length, 0)
    },
  },
  {
    name: 'activity changes flag a calculated hangout as outdated',
    async fn(h) {
      await su(h, 'update public.hangouts set last_calculated_at = now(), inputs_changed_at = null where id = $1', [
        ctx.hangout.id,
      ])
      await vote(h, ctx.amy, ctx.hangout.id, ctx.movies)
      let [row] = await su(h, 'select inputs_changed_at from public.hangouts where id = $1', [ctx.hangout.id])
      assert.ok(row.inputs_changed_at, 'new shortlist entry flags')

      // In all_selected mode, an extra vote on a listed activity changes nothing.
      await su(h, 'update public.hangouts set inputs_changed_at = null where id = $1', [ctx.hangout.id])
      await vote(h, ctx.bo, ctx.hangout.id, ctx.movies)
      ;[row] = await su(h, 'select inputs_changed_at from public.hangouts where id = $1', [ctx.hangout.id])
      assert.equal(row.inputs_changed_at, null)

      // In most_popular mode every vote can change the result.
      await su(h, "update public.hangouts set activity_mode = 'most_popular', inputs_changed_at = null where id = $1", [
        ctx.hangout.id,
      ])
      await vote(h, ctx.bo, ctx.hangout.id, ctx.cafe, false)
      ;[row] = await su(h, 'select inputs_changed_at from public.hangouts where id = $1', [ctx.hangout.id])
      assert.ok(row.inputs_changed_at)
    },
  },
  {
    name: 'closed hangouts reject activity changes',
    async fn(h) {
      await q(h, ctx.amy, "select public.set_hangout_status($1, 'cancelled')", [ctx.hangout.id])
      await rejects(vote(h, ctx.amy, ctx.hangout.id, ctx.cafe), /hangout_closed/)
      await rejects(
        q(h, ctx.amy, 'select public.add_custom_activity($1, $2)', [ctx.hangout.id, 'Picnic']),
        /hangout_closed/,
      )
    },
  },
]
