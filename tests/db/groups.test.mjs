import { assert, rejects, q, su, createGroup, createInvite, join } from './helpers.mjs'

const ctx = {}

export const tests = [
  {
    name: 'create_group makes the creator its admin',
    async fn(h) {
      ctx.ana = await h.createUser('Ana Admin')
      ctx.ben = await h.createUser('Ben Member')
      ctx.cara = await h.createUser('Cara Member')
      ctx.dev = await h.createUser('Dev Outsider')
      ctx.group = await createGroup(h, ctx.ana, 'College Gang')
      assert.equal(ctx.group.name, 'College Gang')
      assert.equal(ctx.group.created_by, ctx.ana)
      const members = await q(h, ctx.ana, 'select user_id, role from public.group_members where group_id = $1', [
        ctx.group.id,
      ])
      assert.deepEqual(members, [{ user_id: ctx.ana, role: 'admin' }])
    },
  },
  {
    name: 'group names are validated',
    async fn(h) {
      await rejects(createGroup(h, ctx.ana, ' x '), /check constraint/)
    },
  },
  {
    name: 'non-members cannot see the group, its members or invitations',
    async fn(h) {
      await createInvite(h, ctx.ana, ctx.group.id)
      assert.equal((await q(h, ctx.dev, 'select id from public.groups')).length, 0)
      assert.equal((await q(h, ctx.dev, 'select id from public.group_members')).length, 0)
      assert.equal((await q(h, ctx.dev, 'select id from public.group_invitations')).length, 0)
      assert.equal((await q(h, ctx.ana, 'select id from public.group_invitations')).length, 1)
    },
  },
  {
    name: 'non-members cannot create invitations; group_members has no direct writes',
    async fn(h) {
      await rejects(createInvite(h, ctx.dev, ctx.group.id), /not_found/)
      await rejects(
        q(h, ctx.dev, "insert into public.group_members (group_id, user_id, role) values ($1, $2, 'admin')", [
          ctx.group.id,
          ctx.dev,
        ]),
        /permission denied/,
      )
    },
  },
  {
    name: 'invitations get a readable 8-character code and an expiry',
    async fn(h) {
      ctx.invite = await createInvite(h, ctx.ana, ctx.group.id, 48)
      assert.match(ctx.invite.invite_code, /^[A-HJ-NP-Z2-9]{8}$/)
      const hours = (new Date(ctx.invite.expires_at) - new Date(ctx.invite.created_at)) / 36e5
      assert.ok(Math.abs(hours - 48) < 0.01, `expected 48h, got ${hours}`)
      await rejects(createInvite(h, ctx.ana, ctx.group.id, 0), /invalid_input/)
      const never = await createInvite(h, ctx.ana, ctx.group.id, null)
      assert.equal(never.expires_at, null)
    },
  },
  {
    name: 'anyone can preview a valid invitation without seeing private data',
    async fn(h) {
      const [preview] = await q(h, null, 'select * from public.get_invitation_preview($1)', [
        ctx.invite.invite_code.toLowerCase(),
      ])
      assert.equal(preview.status, 'valid')
      assert.equal(preview.group_id, ctx.group.id)
      assert.equal(preview.group_name, 'College Gang')
      assert.equal(preview.member_count, 1)
      assert.equal(preview.inviter_name, 'Ana')
      assert.equal(preview.already_member, false)
    },
  },
  {
    name: 'an unknown code previews as not_found with no ids',
    async fn(h) {
      const [preview] = await q(h, null, 'select * from public.get_invitation_preview($1)', ['ZZZZZZZZ'])
      assert.equal(preview.status, 'not_found')
      assert.equal(preview.group_id, null)
      assert.equal(preview.group_name, null)
    },
  },
  {
    name: 'anon cannot call member RPCs',
    async fn(h) {
      await rejects(q(h, null, 'select public.join_group_with_code($1)', [ctx.invite.invite_code]), /permission denied/)
      await rejects(q(h, null, "select public.create_group('Anon group')"), /permission denied/)
    },
  },
  {
    name: 'joining with a code adds a member and notifies admins',
    async fn(h) {
      const result = await join(h, ctx.ben, ctx.invite.invite_code)
      assert.deepEqual(result, { status: 'joined', group_id: ctx.group.id })
      const again = await join(h, ctx.ben, ctx.invite.invite_code)
      assert.equal(again.status, 'already_member')
      const [inv] = await su(h, 'select use_count from public.group_invitations where id = $1', [ctx.invite.id])
      assert.equal(inv.use_count, 1)
      const notes = await q(h, ctx.ana, "select title, link from public.notifications where type = 'member_joined'")
      assert.equal(notes.length, 1)
      assert.match(notes[0].title, /Ben Member joined College Gang/)
      assert.equal(notes[0].link, `/groups/${ctx.group.id}/members`)
      // The preview now reports the member as already in.
      const [preview] = await q(h, ctx.ben, 'select * from public.get_invitation_preview($1)', [
        ctx.invite.invite_code,
      ])
      assert.equal(preview.already_member, true)
      assert.equal(preview.member_count, 2)
    },
  },
  {
    name: 'members can see each other and the group',
    async fn(h) {
      const groups = await q(h, ctx.ben, 'select id from public.groups')
      assert.deepEqual(
        groups.map((g) => g.id),
        [ctx.group.id],
      )
      const members = await q(h, ctx.ben, 'select user_id from public.group_members where group_id = $1', [
        ctx.group.id,
      ])
      assert.equal(members.length, 2)
    },
  },
  {
    name: 'only admins can update or delete the group',
    async fn(h) {
      const byMember = await q(h, ctx.ben, "update public.groups set name = 'Ben rules' where id = $1 returning id", [
        ctx.group.id,
      ])
      assert.equal(byMember.length, 0)
      const del = await q(h, ctx.ben, 'delete from public.groups where id = $1 returning id', [ctx.group.id])
      assert.equal(del.length, 0)
      const byAdmin = await q(
        h,
        ctx.ana,
        "update public.groups set description = 'Old friends', avatar_emoji = '🎓' where id = $1 returning description",
        [ctx.group.id],
      )
      assert.equal(byAdmin[0].description, 'Old friends')
      await rejects(
        q(h, ctx.ana, 'update public.groups set created_by = $2 where id = $1', [ctx.group.id, ctx.ben]),
        /permission denied/,
      )
    },
  },
  {
    name: 'revoked invitations cannot be used; only admins or the creator can revoke',
    async fn(h) {
      const anaInvite = await createInvite(h, ctx.ana, ctx.group.id)
      await rejects(q(h, ctx.ben, 'select public.revoke_group_invitation($1)', [anaInvite.id]), /forbidden/)
      await rejects(q(h, ctx.dev, 'select public.revoke_group_invitation($1)', [anaInvite.id]), /not_found/)
      await q(h, ctx.ana, 'select public.revoke_group_invitation($1)', [anaInvite.id])
      const result = await join(h, ctx.cara, anaInvite.invite_code)
      assert.deepEqual(result, { status: 'revoked' })
      const [preview] = await q(h, null, 'select * from public.get_invitation_preview($1)', [anaInvite.invite_code])
      assert.equal(preview.status, 'revoked')
      assert.equal(preview.group_id, null, 'anon must not learn the group id from a dead invite')

      // A plain member may revoke an invitation they created themselves.
      const benInvite = await createInvite(h, ctx.ben, ctx.group.id)
      await q(h, ctx.ben, 'select public.revoke_group_invitation($1)', [benInvite.id])
      const [row] = await su(h, 'select revoked_at from public.group_invitations where id = $1', [benInvite.id])
      assert.ok(row.revoked_at)
    },
  },
  {
    name: 'expired invitations cannot be used',
    async fn(h) {
      const invite = await createInvite(h, ctx.ana, ctx.group.id, 1)
      await su(h, "update public.group_invitations set expires_at = now() - interval '1 minute' where id = $1", [
        invite.id,
      ])
      assert.deepEqual(await join(h, ctx.cara, invite.invite_code), { status: 'expired' })
      const [preview] = await q(h, null, 'select status from public.get_invitation_preview($1)', [invite.invite_code])
      assert.equal(preview.status, 'expired')
    },
  },
  {
    name: 'invitations stop working after max_uses',
    async fn(h) {
      const invite = await createInvite(h, ctx.ana, ctx.group.id, 24, 1)
      assert.equal((await join(h, ctx.cara, invite.invite_code)).status, 'joined')
      assert.deepEqual(await join(h, ctx.dev, invite.invite_code), { status: 'exhausted' })
      // Someone already in the group is told so, even on a used-up code.
      assert.equal((await join(h, ctx.cara, invite.invite_code)).status, 'already_member')
    },
  },
  {
    name: 'guessing codes is rate limited and failed guesses count',
    async fn(h) {
      const guesser = await h.createUser('Guesser')
      for (let i = 0; i < 10; i++) {
        const result = await join(h, guesser, `AAAAAA${'23456789ABCD'[i]}${'23456789ABCD'[i]}`)
        assert.equal(result.status, 'not_found')
      }
      const error = await rejects(join(h, guesser, 'BBBBBBBB'), /rate_limited/)
      assert.match(error.detail, /Try again/)
      // A valid code is refused too while the window lasts.
      const invite = await createInvite(h, ctx.ana, ctx.group.id)
      await rejects(join(h, guesser, invite.invite_code), /rate_limited/)
      // The window expires.
      await su(h, "update private.rate_limits set window_start = now() - interval '11 minutes' where user_id = $1", [
        guesser,
      ])
      assert.equal((await join(h, guesser, invite.invite_code)).status, 'joined')
    },
  },
  {
    name: 'only admins can remove members, and the removed member is notified',
    async fn(h) {
      await rejects(
        q(h, ctx.ben, 'select public.remove_group_member($1, $2)', [ctx.group.id, ctx.cara]),
        /forbidden/,
      )
      await rejects(q(h, ctx.ana, 'select public.remove_group_member($1, $2)', [ctx.group.id, ctx.ana]), /invalid_input/)
      await q(h, ctx.ana, 'select public.remove_group_member($1, $2)', [ctx.group.id, ctx.cara])
      assert.equal((await q(h, ctx.cara, 'select id from public.groups')).length, 0)
      const notes = await q(h, ctx.cara, "select title, link from public.notifications where type = 'member_removed'")
      assert.equal(notes.length, 1)
      assert.match(notes[0].title, /removed from College Gang/)
      await rejects(
        q(h, ctx.ana, 'select public.remove_group_member($1, $2)', [ctx.group.id, ctx.cara]),
        /not_found/,
      )
    },
  },
  {
    name: 'transferring admin rights swaps roles',
    async fn(h) {
      await rejects(
        q(h, ctx.ben, 'select public.transfer_group_admin($1, $2)', [ctx.group.id, ctx.ben]),
        /forbidden/,
      )
      await rejects(
        q(h, ctx.ana, 'select public.transfer_group_admin($1, $2)', [ctx.group.id, ctx.dev]),
        /not_found/,
      )
      await q(h, ctx.ana, 'select public.transfer_group_admin($1, $2)', [ctx.group.id, ctx.ben])
      const roles = await q(h, ctx.ana, 'select user_id, role from public.group_members where group_id = $1', [
        ctx.group.id,
      ])
      const byUser = Object.fromEntries(roles.map((r) => [r.user_id, r.role]))
      assert.equal(byUser[ctx.ben], 'admin')
      assert.equal(byUser[ctx.ana], 'member')
      const notes = await q(h, ctx.ben, "select id from public.notifications where type = 'admin_transferred'")
      assert.equal(notes.length, 1)
    },
  },
  {
    name: 'leave_group removes your membership',
    async fn(h) {
      await rejects(q(h, ctx.dev, 'select public.leave_group($1)', [ctx.group.id]), /not_found/)
      // Ana (now a plain member) leaves.
      await q(h, ctx.ana, 'select public.leave_group($1)', [ctx.group.id])
      assert.equal((await q(h, ctx.ana, 'select id from public.groups where id = $1', [ctx.group.id])).length, 0)
    },
  },
  {
    name: 'when the last admin leaves, the longest-standing member is promoted',
    async fn(h) {
      const owner = await h.createUser('Olga Owner')
      const first = await h.createUser('Fiona First')
      const second = await h.createUser('Sam Second')
      const group = await createGroup(h, owner, 'Office Friends')
      const invite = await createInvite(h, owner, group.id)
      await join(h, first, invite.invite_code)
      await su(h, "update public.group_members set joined_at = now() - interval '2 days' where user_id = $1", [first])
      await join(h, second, invite.invite_code)
      await q(h, owner, 'select public.leave_group($1)', [group.id])
      const rows = await su(h, 'select user_id, role from public.group_members where group_id = $1', [group.id])
      const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r.role]))
      assert.equal(byUser[first], 'admin')
      assert.equal(byUser[second], 'member')
    },
  },
  {
    name: 'when the last member leaves, the group is deleted',
    async fn(h) {
      const solo = await h.createUser('Solo Sam')
      const group = await createGroup(h, solo, 'Just Me')
      await q(h, solo, 'select public.leave_group($1)', [group.id])
      assert.equal((await su(h, 'select id from public.groups where id = $1', [group.id])).length, 0)
    },
  },
]
