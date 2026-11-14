import { assert, rejects, q, su, saveLocation, groupWith } from './helpers.mjs'

const ctx = {}

export const tests = [
  {
    name: 'sign-up creates a profile with the name from metadata',
    async fn(h) {
      ctx.maya = await h.createUser('Maya Kulkarni')
      ctx.aarav = await h.createUser('Aarav Shah')
      ctx.stranger = await h.createUser('Stranger Danger')
      const rows = await su(h, 'select full_name, email, preferred_travel_mode from public.profiles where id = $1', [
        ctx.maya,
      ])
      assert.equal(rows.length, 1)
      assert.equal(rows[0].full_name, 'Maya Kulkarni')
      assert.equal(rows[0].email, 'maya.kulkarni@example.test')
      assert.equal(rows[0].preferred_travel_mode, 'DRIVE')
    },
  },
  {
    name: 'sign-up falls back to the email name and drops non-https avatars',
    async fn(h) {
      const id = crypto.randomUUID()
      await h.db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
        id,
        'nameless@example.test',
        JSON.stringify({ avatar_url: 'javascript:alert(1)' }),
      ])
      const [row] = await su(h, 'select full_name, avatar_url from public.profiles where id = $1', [id])
      assert.equal(row.full_name, 'nameless')
      assert.equal(row.avatar_url, null)
    },
  },
  {
    name: 'email is hidden from the API; public columns are readable',
    async fn(h) {
      await rejects(q(h, ctx.maya, 'select email from public.profiles'), /permission denied/)
      await rejects(q(h, ctx.maya, 'select * from public.profiles'), /permission denied/)
      const rows = await q(h, ctx.maya, 'select id, full_name, avatar_url from public.profiles')
      assert.deepEqual(
        rows.map((r) => r.id),
        [ctx.maya],
      )
    },
  },
  {
    name: 'a user can update their own name and travel mode, not someone else\'s',
    async fn(h) {
      const own = await q(
        h,
        ctx.maya,
        "update public.profiles set full_name = 'Maya K', preferred_travel_mode = 'TWO_WHEELER' where id = $1 returning id",
        [ctx.maya],
      )
      assert.equal(own.length, 1)
      const other = await q(h, ctx.maya, "update public.profiles set full_name = 'Hacked' where id = $1 returning id", [
        ctx.aarav,
      ])
      assert.equal(other.length, 0)
      await rejects(
        q(h, ctx.maya, "update public.profiles set email = 'x@y.z' where id = $1", [ctx.maya]),
        /permission denied/,
      )
      const [row] = await su(h, 'select full_name from public.profiles where id = $1', [ctx.aarav])
      assert.equal(row.full_name, 'Aarav Shah')
    },
  },
  {
    name: 'profiles of group mates are visible; strangers are not',
    async fn(h) {
      await groupWith(h, ctx.maya, [ctx.aarav])
      const seen = await q(h, ctx.maya, 'select id from public.profiles order by full_name')
      assert.deepEqual(new Set(seen.map((r) => r.id)), new Set([ctx.maya, ctx.aarav]))
      const strangerSees = await q(h, ctx.stranger, 'select id from public.profiles')
      assert.deepEqual(
        strangerSees.map((r) => r.id),
        [ctx.stranger],
      )
      const anon = await rejects(q(h, null, 'select id from public.profiles'), /permission denied/)
      assert.ok(anon)
    },
  },
  {
    name: 'saved places are owner-only and the first one becomes primary',
    async fn(h) {
      ctx.home = await saveLocation(h, ctx.maya, 'Home', 18.5204, 73.8567)
      assert.equal(ctx.home.is_primary, true)
      assert.equal(ctx.home.user_id, ctx.maya)
      ctx.office = await saveLocation(h, ctx.maya, 'Office', 18.59, 73.74)
      assert.equal(ctx.office.is_primary, false)

      assert.equal((await q(h, ctx.aarav, 'select id from public.user_locations')).length, 0)
      assert.equal((await q(h, ctx.maya, 'select id from public.user_locations')).length, 2)

      // Another user cannot change or delete them.
      const upd = await q(h, ctx.aarav, 'update public.user_locations set latitude = 0 where id = $1 returning id', [
        ctx.home.id,
      ])
      assert.equal(upd.length, 0)
      const del = await q(h, ctx.aarav, 'delete from public.user_locations where id = $1 returning id', [ctx.home.id])
      assert.equal(del.length, 0)
    },
  },
  {
    name: 'a user cannot insert a saved place for someone else',
    async fn(h) {
      await rejects(
        q(
          h,
          ctx.aarav,
          'insert into public.user_locations (user_id, location_name, latitude, longitude) values ($1, $2, 1, 1)',
          [ctx.maya, 'Sneaky'],
        ),
        /permission denied/,
      )
    },
  },
  {
    name: 'setting another primary unsets the old one',
    async fn(h) {
      await q(h, ctx.maya, 'update public.user_locations set is_primary = true where id = $1', [ctx.office.id])
      const rows = await q(h, ctx.maya, 'select id, is_primary from public.user_locations order by location_name')
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.is_primary]))
      assert.equal(byId[ctx.office.id], true)
      assert.equal(byId[ctx.home.id], false)
    },
  },
  {
    name: 'deleting the primary place promotes another',
    async fn(h) {
      await q(h, ctx.maya, 'delete from public.user_locations where id = $1', [ctx.office.id])
      const rows = await q(h, ctx.maya, 'select id, is_primary from public.user_locations')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].id, ctx.home.id)
      assert.equal(rows[0].is_primary, true)
    },
  },
  {
    name: 'coordinates are validated',
    async fn(h) {
      await rejects(saveLocation(h, ctx.maya, 'Bad', 91, 0), /check constraint/)
      await rejects(saveLocation(h, ctx.maya, 'Bad', 0, 181), /check constraint/)
      await rejects(saveLocation(h, ctx.maya, '', 1, 1), /check constraint/)
    },
  },
  {
    name: 'a user can save at most 10 places',
    async fn(h) {
      for (let i = 2; i <= 10; i++) await saveLocation(h, ctx.maya, `Place ${i}`, 18 + i / 100, 73)
      assert.equal((await q(h, ctx.maya, 'select id from public.user_locations')).length, 10)
      await rejects(saveLocation(h, ctx.maya, 'Eleventh', 18, 73), /location_limit_reached/)
      const primaries = await q(h, ctx.maya, 'select id from public.user_locations where is_primary')
      assert.equal(primaries.length, 1)
    },
  },
]
