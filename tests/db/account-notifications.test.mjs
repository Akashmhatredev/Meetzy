import {
  assert,
  rejects,
  q,
  su,
  groupWith,
  createHangout,
  saveLocation,
  shareManual,
  activityId,
} from './helpers.mjs'

const ctx = {}

const notifications = (h, userId) =>
  q(h, userId, 'select id, type, read_at from public.notifications order by created_at, id')

export const tests = [
  {
    name: 'notifications are private to their owner',
    async fn(h) {
      ctx.ada = await h.createUser('Ada Admin')
      ctx.bea = await h.createUser('Bea Member')
      ctx.cal = await h.createUser('Cal Member')
      ctx.group = await groupWith(h, ctx.ada, [ctx.bea, ctx.cal], 'Travel Buddies')
      ctx.hangout = await createHangout(h, ctx.ada, ctx.group.id, 'Lonavala trip')
      await createHangout(h, ctx.ada, ctx.group.id, 'Dinner after')

      const bea = await notifications(h, ctx.bea)
      assert.equal(bea.length, 2)
      assert.ok(bea.every((n) => n.type === 'hangout_created'))
      const ada = await notifications(h, ctx.ada)
      assert.ok(ada.every((n) => n.type === 'member_joined'), 'Ada only sees her own notifications')
      assert.ok(!ada.some((n) => bea.some((b) => b.id === n.id)))
      ctx.beaNotes = bea
    },
  },
  {
    name: 'owners can mark read and delete, but not rewrite or forge notifications',
    async fn(h) {
      const [first, second] = ctx.beaNotes
      const own = await q(h, ctx.bea, 'update public.notifications set read_at = now() where id = $1 returning id', [
        first.id,
      ])
      assert.equal(own.length, 1)
      const other = await q(h, ctx.cal, 'update public.notifications set read_at = now() where id = $1 returning id', [
        second.id,
      ])
      assert.equal(other.length, 0)
      await rejects(
        q(h, ctx.bea, "update public.notifications set title = 'Phish' where id = $1", [second.id]),
        /permission denied/,
      )
      await rejects(
        q(h, ctx.bea, "insert into public.notifications (user_id, type, title) values ($1, 'x', 'Forged')", [ctx.cal]),
        /permission denied/,
      )
      const deleted = await q(h, ctx.cal, 'delete from public.notifications where id = $1 returning id', [second.id])
      assert.equal(deleted.length, 0, 'Cal cannot delete Bea\'s notification')
    },
  },
  {
    name: 'mark_notifications_read marks selected or all unread notifications',
    async fn(h) {
      const calNotes = await notifications(h, ctx.cal)
      assert.equal(calNotes.length, 2)
      const [{ n: one }] = await q(h, ctx.cal, 'select public.mark_notifications_read($1) as n', [[calNotes[0].id]])
      assert.equal(one, 1)
      // Someone else's id is ignored.
      const [{ n: none }] = await q(h, ctx.cal, 'select public.mark_notifications_read($1) as n', [[ctx.beaNotes[1].id]])
      assert.equal(none, 0)
      const [{ n: rest }] = await q(h, ctx.cal, 'select public.mark_notifications_read() as n')
      assert.equal(rest, 1)
      assert.ok((await notifications(h, ctx.cal)).every((n) => n.read_at))
      const bea = await notifications(h, ctx.bea)
      assert.equal(bea.filter((n) => !n.read_at).length, 1, 'Bea\'s unread notification is untouched')
      const deleted = await q(h, ctx.bea, 'delete from public.notifications where id = $1 returning id', [bea[0].id])
      assert.equal(deleted.length, 1)
    },
  },
  {
    name: 'avatar uploads are limited to your own folder or groups you administer',
    async fn(h) {
      const put = (userId, name) =>
        q(h, userId, "insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2) returning id", [
          name,
          userId,
        ])
      assert.equal((await put(ctx.bea, `${ctx.bea}/avatar-1.webp`)).length, 1)
      await rejects(put(ctx.bea, `${ctx.cal}/avatar-1.webp`), /row-level security/)
      assert.equal((await put(ctx.ada, `groups/${ctx.group.id}/avatar.webp`)).length, 1)
      await rejects(put(ctx.bea, `groups/${ctx.group.id}/avatar.webp`), /row-level security/)
      await rejects(put(ctx.ada, 'groups/not-a-uuid/avatar.webp'), /row-level security/)
      await rejects(put(ctx.bea, 'avatar.webp'), /row-level security/)
      const mine = await q(h, ctx.bea, 'select name from storage.objects')
      assert.deepEqual(
        mine.map((o) => o.name),
        [`${ctx.bea}/avatar-1.webp`],
      )
      const removed = await q(h, ctx.cal, 'delete from storage.objects where name = $1 returning id', [
        `${ctx.bea}/avatar-1.webp`,
      ])
      assert.equal(removed.length, 0)
    },
  },
  {
    name: 'delete_my_account removes the user and everything personal',
    async fn(h) {
      const home = await saveLocation(h, ctx.ada, 'Home', 18.5, 73.8)
      await q(h, ctx.ada, "select public.share_hangout_location($1, 'saved', $2)", [ctx.hangout.id, home.id])
      await shareManual(h, ctx.bea, ctx.hangout.id)
      await q(h, ctx.ada, 'select public.toggle_activity_vote($1, $2, true)', [
        ctx.hangout.id,
        await activityId(h, 'parks'),
      ])
      // Bea joined before Cal, so she becomes admin.
      await su(h, "update public.group_members set joined_at = now() - interval '1 day' where user_id = $1", [ctx.bea])

      await rejects(q(h, null, 'select public.delete_my_account()'), /permission denied/)
      await q(h, ctx.ada, 'select public.delete_my_account()')

      const left = async (sql) => (await su(h, sql, [ctx.ada])).length
      assert.equal(await left('select id from auth.users where id = $1'), 0)
      assert.equal(await left('select id from public.profiles where id = $1'), 0)
      assert.equal(await left('select id from public.group_members where user_id = $1'), 0)
      assert.equal(await left('select id from public.user_locations where user_id = $1'), 0)
      assert.equal(await left('select id from public.hangout_locations where user_id = $1'), 0)
      assert.equal(await left('select id from public.activity_votes where user_id = $1'), 0)
      assert.equal(await left('select id from public.notifications where user_id = $1'), 0)

      const [group] = await su(h, 'select id, created_by from public.groups where id = $1', [ctx.group.id])
      assert.ok(group, 'the group survives')
      assert.equal(group.created_by, null)
      const [member] = await su(h, 'select role from public.group_members where group_id = $1 and user_id = $2', [
        ctx.group.id,
        ctx.bea,
      ])
      assert.equal(member.role, 'admin', 'the longest-standing member is promoted')
      const [hangout] = await su(h, 'select created_by from public.hangouts where id = $1', [ctx.hangout.id])
      assert.equal(hangout.created_by, null)
      // The parks shortlist entry outlives its proposer but lost its only vote.
      const shares = await q(h, ctx.bea, 'select user_id from public.hangout_locations where hangout_id = $1', [
        ctx.hangout.id,
      ])
      assert.deepEqual(
        shares.map((s) => s.user_id),
        [ctx.bea],
      )
      // The new admin can manage the orphaned hangout.
      const upd = await q(h, ctx.bea, "update public.hangouts set title = 'Lonavala trip v2' where id = $1 returning id", [
        ctx.hangout.id,
      ])
      assert.equal(upd.length, 1)
    },
  },
]
