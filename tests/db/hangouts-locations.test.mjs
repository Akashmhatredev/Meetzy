import {
  assert,
  rejects,
  q,
  su,
  groupWith,
  createHangout,
  saveLocation,
  shareManual,
} from './helpers.mjs'

const ctx = {}

export const tests = [
  {
    name: 'create_hangout starts waiting for locations and notifies the other members',
    async fn(h) {
      ctx.olivia = await h.createUser('Olivia Organiser')
      ctx.priya = await h.createUser('Priya Member')
      ctx.raj = await h.createUser('Raj Member')
      ctx.sid = await h.createUser('Sid Stranger')
      ctx.group = await groupWith(h, ctx.olivia, [ctx.priya, ctx.raj], 'Weekend Squad')
      ctx.hangout = await createHangout(h, ctx.olivia, ctx.group.id, 'Saturday brunch', { travelMode: 'TWO_WHEELER' })
      assert.equal(ctx.hangout.status, 'waiting_for_locations')
      assert.equal(ctx.hangout.created_by, ctx.olivia)
      assert.equal(ctx.hangout.travel_mode, 'TWO_WHEELER')
      const notes = await su(
        h,
        "select user_id, link from public.notifications where type = 'hangout_created' and hangout_id = $1",
        [ctx.hangout.id],
      )
      assert.deepEqual(new Set(notes.map((n) => n.user_id)), new Set([ctx.priya, ctx.raj]))
      assert.equal(notes[0].link, `/hangouts/${ctx.hangout.id}`)
    },
  },
  {
    name: 'strangers cannot create, see or touch hangouts',
    async fn(h) {
      await rejects(createHangout(h, ctx.sid, ctx.group.id), /not_found/)
      assert.equal((await q(h, ctx.sid, 'select id from public.hangouts')).length, 0)
      const upd = await q(h, ctx.sid, "update public.hangouts set title = 'Mine' where id = $1 returning id", [
        ctx.hangout.id,
      ])
      assert.equal(upd.length, 0)
      await rejects(
        q(h, ctx.olivia, 'insert into public.hangouts (group_id, title) values ($1, $2)', [ctx.group.id, 'Direct']),
        /permission denied/,
      )
    },
  },
  {
    name: 'members share a current or pinned location',
    async fn(h) {
      const pinned = await shareManual(h, ctx.priya, ctx.hangout.id, 18.5, 73.8, 'manual')
      assert.equal(pinned.source, 'manual')
      assert.equal(pinned.label, 'Pinned location')
      assert.equal(pinned.user_id, ctx.priya)
      const current = await shareManual(h, ctx.priya, ctx.hangout.id, 18.51, 73.81, 'current')
      assert.equal(current.id, pinned.id, 'sharing again updates the same row')
      assert.equal(current.label, 'Current location')
      assert.equal(current.latitude, 18.51)
      await rejects(shareManual(h, ctx.priya, ctx.hangout.id, 95, 73.8), /invalid_input/)
      await rejects(
        q(h, ctx.priya, "select public.share_hangout_location($1, 'manual', null, null, null, null, null)", [
          ctx.hangout.id,
        ]),
        /invalid_input/,
      )
    },
  },
  {
    name: 'sharing a saved place copies it server-side; someone else\'s place is refused',
    async fn(h) {
      ctx.rajHome = await saveLocation(h, ctx.raj, 'Home', 18.56, 73.91)
      const [share] = await q(
        h,
        ctx.raj,
        "select * from public.share_hangout_location($1, 'saved', $2, 0, 0, 'ignored', 'ignored')",
        [ctx.hangout.id, ctx.rajHome.id],
      )
      assert.equal(share.source, 'saved')
      assert.equal(share.latitude, 18.56)
      assert.equal(share.longitude, 73.91)
      assert.equal(share.label, 'Home')
      assert.equal(share.source_location_id, ctx.rajHome.id)
      await rejects(
        q(h, ctx.priya, "select public.share_hangout_location($1, 'saved', $2)", [ctx.hangout.id, ctx.rajHome.id]),
        /not_found/,
      )
    },
  },
  {
    name: 'shares are visible to members only and cannot be written directly',
    async fn(h) {
      const seen = await q(h, ctx.olivia, 'select user_id from public.hangout_locations where hangout_id = $1', [
        ctx.hangout.id,
      ])
      assert.deepEqual(new Set(seen.map((r) => r.user_id)), new Set([ctx.priya, ctx.raj]))
      assert.equal((await q(h, ctx.sid, 'select id from public.hangout_locations')).length, 0)
      await rejects(shareManual(h, ctx.sid, ctx.hangout.id), /not_found/)
      await rejects(
        q(
          h,
          ctx.priya,
          "insert into public.hangout_locations (hangout_id, user_id, latitude, longitude, source) values ($1, $2, 1, 1, 'manual')",
          [ctx.hangout.id, ctx.olivia],
        ),
        /permission denied/,
      )
      await rejects(
        q(h, ctx.priya, 'update public.hangout_locations set latitude = 0 where user_id = $1', [ctx.raj]),
        /permission denied/,
      )
    },
  },
  {
    name: 'stop sharing deletes the share',
    async fn(h) {
      await q(h, ctx.priya, 'select public.stop_sharing_hangout_location($1)', [ctx.hangout.id])
      const rows = await q(h, ctx.olivia, 'select user_id from public.hangout_locations where hangout_id = $1', [
        ctx.hangout.id,
      ])
      assert.deepEqual(
        rows.map((r) => r.user_id),
        [ctx.raj],
      )
    },
  },
  {
    name: 'deleting a saved place withdraws the shares made from it',
    async fn(h) {
      await q(h, ctx.raj, 'delete from public.user_locations where id = $1', [ctx.rajHome.id])
      const rows = await su(h, 'select id from public.hangout_locations where hangout_id = $1 and user_id = $2', [
        ctx.hangout.id,
        ctx.raj,
      ])
      assert.equal(rows.length, 0)
    },
  },
  {
    name: 'group-level sharing auto-shares the primary place into open and new hangouts',
    async fn(h) {
      ctx.priyaHome = await saveLocation(h, ctx.priya, 'Home', 18.47, 73.86)
      ctx.second = await createHangout(h, ctx.olivia, ctx.group.id, 'Movie night')
      const [{ count }] = await q(h, ctx.priya, 'select public.set_group_location_sharing($1, true) as count', [
        ctx.group.id,
      ])
      assert.equal(count, 2, 'both open hangouts get a share')
      const member = await su(
        h,
        'select location_sharing_enabled, location_sharing_updated_at from public.group_members where group_id = $1 and user_id = $2',
        [ctx.group.id, ctx.priya],
      )
      assert.equal(member[0].location_sharing_enabled, true)
      assert.ok(member[0].location_sharing_updated_at)

      ctx.third = await createHangout(h, ctx.raj, ctx.group.id, 'Bowling')
      const shares = await su(
        h,
        'select hangout_id, source, source_location_id, latitude from public.hangout_locations where user_id = $1',
        [ctx.priya],
      )
      assert.deepEqual(
        new Set(shares.map((s) => s.hangout_id)),
        new Set([ctx.hangout.id, ctx.second.id, ctx.third.id]),
      )
      for (const s of shares) {
        assert.equal(s.source, 'saved')
        assert.equal(s.source_location_id, ctx.priyaHome.id)
        assert.equal(s.latitude, 18.47)
      }
      // Raj has no saved place and did not opt in: nothing was shared for him.
      const raj = await su(h, 'select id from public.hangout_locations where user_id = $1', [ctx.raj])
      assert.equal(raj.length, 0)
    },
  },
  {
    name: 'editing a saved place updates shares in open hangouts only',
    async fn(h) {
      await q(h, ctx.olivia, "select public.set_hangout_status($1, 'cancelled')", [ctx.second.id])
      await su(h, 'update public.hangouts set last_calculated_at = now() where id = $1', [ctx.third.id])
      await q(h, ctx.priya, "update public.user_locations set latitude = 18.49, location_name = 'New home' where id = $1", [
        ctx.priyaHome.id,
      ])
      const rows = await su(h, 'select hangout_id, latitude, label from public.hangout_locations where user_id = $1', [
        ctx.priya,
      ])
      const byHangout = Object.fromEntries(rows.map((r) => [r.hangout_id, r]))
      assert.equal(byHangout[ctx.third.id].latitude, 18.49)
      assert.equal(byHangout[ctx.third.id].label, 'New home')
      assert.equal(byHangout[ctx.second.id].latitude, 18.47, 'cancelled hangout keeps its snapshot')
      const [third] = await su(h, 'select inputs_changed_at from public.hangouts where id = $1', [ctx.third.id])
      assert.ok(third.inputs_changed_at, 'a calculated hangout is flagged as outdated')
    },
  },
  {
    name: 'closed hangouts reject new shares',
    async fn(h) {
      await rejects(shareManual(h, ctx.raj, ctx.second.id), /hangout_closed/)
    },
  },
  {
    name: 'turning group sharing off withdraws shares from open hangouts',
    async fn(h) {
      const [{ count }] = await q(h, ctx.priya, 'select public.set_group_location_sharing($1, false) as count', [
        ctx.group.id,
      ])
      assert.equal(count, 2)
      const rows = await su(h, 'select hangout_id from public.hangout_locations where user_id = $1', [ctx.priya])
      assert.deepEqual(
        rows.map((r) => r.hangout_id),
        [ctx.second.id],
        'only the cancelled hangout keeps its record',
      )
      await rejects(
        q(h, ctx.sid, 'select public.set_group_location_sharing($1, true)', [ctx.group.id]),
        /not_found/,
      )
    },
  },
  {
    name: 'organisers update allowed settings; plain members cannot',
    async fn(h) {
      const own = await q(
        h,
        ctx.olivia,
        "update public.hangouts set title = 'Sunday brunch', travel_mode = 'TRANSIT', max_travel_minutes = 40 where id = $1 returning title, travel_mode",
        [ctx.hangout.id],
      )
      assert.deepEqual(own, [{ title: 'Sunday brunch', travel_mode: 'TRANSIT' }])
      const member = await q(h, ctx.priya, "update public.hangouts set title = 'Nope' where id = $1 returning id", [
        ctx.hangout.id,
      ])
      assert.equal(member.length, 0)
      // Raj created the third hangout, so he may manage it without being an admin.
      const creator = await q(h, ctx.raj, "update public.hangouts set notes = 'Bring socks' where id = $1 returning id", [
        ctx.third.id,
      ])
      assert.equal(creator.length, 1)
      const del = await q(h, ctx.priya, 'delete from public.hangouts where id = $1 returning id', [ctx.hangout.id])
      assert.equal(del.length, 0)
    },
  },
  {
    name: 'status, ownership and engine columns cannot be updated directly',
    async fn(h) {
      await rejects(
        q(h, ctx.olivia, "update public.hangouts set status = 'finalized' where id = $1", [ctx.hangout.id]),
        /permission denied/,
      )
      await rejects(
        q(h, ctx.olivia, 'update public.hangouts set created_by = $2 where id = $1', [ctx.hangout.id, ctx.priya]),
        /permission denied/,
      )
      await rejects(
        q(h, ctx.olivia, 'update public.hangouts set selected_venue_id = null where id = $1', [ctx.hangout.id]),
        /permission denied/,
      )
    },
  },
  {
    name: 'closed hangouts and past deadlines are rejected on direct update',
    async fn(h) {
      await rejects(
        q(h, ctx.olivia, "update public.hangouts set title = 'Revived' where id = $1", [ctx.second.id]),
        /hangout_closed/,
      )
      await rejects(
        q(h, ctx.olivia, "update public.hangouts set voting_deadline = now() - interval '1 hour' where id = $1", [
          ctx.hangout.id,
        ]),
        /invalid_deadline/,
      )
      const ok = await q(
        h,
        ctx.olivia,
        "update public.hangouts set voting_deadline = now() + interval '1 day' where id = $1 returning id",
        [ctx.hangout.id],
      )
      assert.equal(ok.length, 1)
    },
  },
  {
    name: 'changing settings of a calculated hangout flags it as outdated',
    async fn(h) {
      await su(h, 'update public.hangouts set last_calculated_at = now(), inputs_changed_at = null where id = $1', [
        ctx.hangout.id,
      ])
      await q(h, ctx.olivia, "update public.hangouts set optimization_strategy = 'balanced' where id = $1", [
        ctx.hangout.id,
      ])
      const [row] = await su(h, 'select inputs_changed_at from public.hangouts where id = $1', [ctx.hangout.id])
      assert.ok(row.inputs_changed_at)
    },
  },
  {
    name: 'set_hangout_status enforces permissions and transitions',
    async fn(h) {
      await rejects(
        q(h, ctx.priya, "select public.set_hangout_status($1, 'activity_selection')", [ctx.hangout.id]),
        /forbidden/,
      )
      await rejects(
        q(h, ctx.olivia, "select public.set_hangout_status($1, 'finalized')", [ctx.hangout.id]),
        /invalid_transition/,
      )
      await rejects(
        q(h, ctx.olivia, "select public.set_hangout_status($1, 'calculating')", [ctx.hangout.id]),
        /invalid_transition/,
      )
      await rejects(
        q(h, ctx.olivia, "select public.set_hangout_status($1, 'venue_discovery')", [ctx.hangout.id]),
        /no_venues/,
      )
      const [moved] = await q(h, ctx.olivia, "select * from public.set_hangout_status($1, 'activity_selection')", [
        ctx.hangout.id,
      ])
      assert.equal(moved.status, 'activity_selection')

      // Cancelled hangouts can only be restored to a planning stage.
      await rejects(
        q(h, ctx.olivia, "select public.set_hangout_status($1, 'voting')", [ctx.second.id]),
        /invalid_transition/,
      )
      const [restored] = await q(
        h,
        ctx.olivia,
        "select * from public.set_hangout_status($1, 'waiting_for_locations')",
        [ctx.second.id],
      )
      assert.equal(restored.status, 'waiting_for_locations')
      assert.equal(restored.cancelled_at, null)
      const cancelNotes = await su(
        h,
        "select user_id from public.notifications where type = 'hangout_cancelled' and hangout_id = $1",
        [ctx.second.id],
      )
      assert.deepEqual(new Set(cancelNotes.map((n) => n.user_id)), new Set([ctx.priya, ctx.raj]))
    },
  },
  {
    name: 'a member who leaves the group takes their open shares with them',
    async fn(h) {
      await shareManual(h, ctx.raj, ctx.hangout.id)
      await q(h, ctx.raj, 'select public.leave_group($1)', [ctx.group.id])
      const rows = await su(h, 'select id from public.hangout_locations where user_id = $1 and hangout_id = $2', [
        ctx.raj,
        ctx.hangout.id,
      ])
      assert.equal(rows.length, 0)
    },
  },
]
