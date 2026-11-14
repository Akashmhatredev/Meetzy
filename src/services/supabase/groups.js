import { supabase, unwrap } from './client'

const MEMBER_PROFILE = 'profile:profiles(id, full_name, avatar_url)'
export const GROUP_COLUMNS = 'id, name, description, avatar_url, avatar_emoji, color, created_by, created_at, updated_at'

export async function listMyGroups() {
  return unwrap(
    await supabase()
      .from('groups')
      .select(
        `${GROUP_COLUMNS},
         members:group_members(user_id, role, location_sharing_enabled, ${MEMBER_PROFILE}),
         hangouts(id, status)`,
      )
      .order('updated_at', { ascending: false }),
  )
}

export async function getGroup(groupId) {
  return unwrap(await supabase().from('groups').select(GROUP_COLUMNS).eq('id', groupId).maybeSingle())
}

export async function createGroup({ name, description, emoji, color }) {
  return unwrap(
    await supabase().rpc('create_group', {
      p_name: name,
      p_description: description || null,
      p_emoji: emoji,
      p_color: color,
    }),
  )
}

export async function updateGroup(groupId, patch) {
  const allowed = {}
  for (const key of ['name', 'description', 'avatar_url', 'avatar_emoji', 'color']) {
    if (key in patch) allowed[key] = patch[key]
  }
  return unwrap(await supabase().from('groups').update(allowed).eq('id', groupId).select(GROUP_COLUMNS).single())
}

export async function deleteGroup(groupId) {
  unwrap(await supabase().from('groups').delete().eq('id', groupId))
}

export async function listMembers(groupId) {
  return unwrap(
    await supabase()
      .from('group_members')
      .select(`id, group_id, user_id, role, location_sharing_enabled, location_sharing_updated_at, joined_at, ${MEMBER_PROFILE}`)
      .eq('group_id', groupId)
      .order('joined_at'),
  )
}

export async function listInvitations(groupId) {
  return unwrap(
    await supabase()
      .from('group_invitations')
      .select('id, group_id, invite_code, created_by, expires_at, revoked_at, max_uses, use_count, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
  )
}

export async function createInvitation(groupId, { expiresInHours = 168, maxUses = null } = {}) {
  return unwrap(
    await supabase().rpc('create_group_invitation', {
      p_group_id: groupId,
      p_expires_in_hours: expiresInHours,
      p_max_uses: maxUses,
    }),
  )
}

export async function revokeInvitation(invitationId) {
  unwrap(await supabase().rpc('revoke_group_invitation', { p_invitation_id: invitationId }))
}

export async function previewInvitation(code) {
  const rows = unwrap(await supabase().rpc('get_invitation_preview', { p_code: code }))
  return rows?.[0] ?? { status: 'not_found' }
}

export async function joinWithCode(code) {
  return unwrap(await supabase().rpc('join_group_with_code', { p_code: code }))
}

export async function leaveGroup(groupId) {
  unwrap(await supabase().rpc('leave_group', { p_group_id: groupId }))
}

export async function removeMember(groupId, userId) {
  unwrap(await supabase().rpc('remove_group_member', { p_group_id: groupId, p_user_id: userId }))
}

export async function transferAdmin(groupId, userId) {
  unwrap(await supabase().rpc('transfer_group_admin', { p_group_id: groupId, p_user_id: userId }))
}

export async function setGroupLocationSharing(groupId, enabled) {
  return unwrap(
    await supabase().rpc('set_group_location_sharing', { p_group_id: groupId, p_enabled: enabled }),
  )
}
