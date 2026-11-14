import { useRouter } from 'vue-router'
import { leaveGroup, deleteGroup, removeMember, transferAdmin } from '@/services/supabase/groups'
import { useGroupStore } from '@/stores/group'
import { useGroupsStore } from '@/stores/groups'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/utils/errors'
import { firstName } from '@/utils/format'

/** Confirm-then-act helpers shared by the group dashboard and members page. */
export function useGroupActions() {
  const group = useGroupStore()
  const groups = useGroupsStore()
  const ui = useUiStore()
  const router = useRouter()

  async function leave() {
    const soleAdmin = group.isAdmin && group.members.filter((m) => m.role === 'admin').length === 1
    const ok = await ui.confirm({
      title: `Leave ${group.group.name}?`,
      message: soleAdmin
        ? 'You are the only admin, so the longest-standing member becomes admin. Your location shares in open plans are removed.'
        : 'Your location shares in plans still in progress are removed. You can rejoin with an invite link.',
      confirmLabel: 'Leave group',
      danger: true,
    })
    if (!ok) return
    try {
      await leaveGroup(group.groupId)
      groups.load({ silent: true })
      ui.success(`You left ${group.group.name}.`)
      router.replace('/groups')
    } catch (e) {
      ui.error(errorMessage(e))
    }
  }

  async function remove() {
    const ok = await ui.confirm({
      title: `Delete ${group.group.name}?`,
      message: 'This deletes the group, all of its hangouts, votes and location shares for everyone. This cannot be undone.',
      confirmLabel: 'Delete group',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteGroup(group.groupId)
      groups.load({ silent: true })
      ui.success('Group deleted.')
      router.replace('/groups')
    } catch (e) {
      ui.error(errorMessage(e))
    }
  }

  async function kick(member) {
    const name = member.profile?.full_name || 'this member'
    const ok = await ui.confirm({
      title: `Remove ${name}?`,
      message: `${firstName(name)} loses access to the group and its plans. Their location shares in open plans are deleted.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    try {
      await removeMember(group.groupId, member.user_id)
      await group.refresh()
      ui.success(`${firstName(name)} was removed.`)
    } catch (e) {
      ui.error(errorMessage(e))
    }
  }

  async function makeAdmin(member) {
    const name = member.profile?.full_name || 'this member'
    const ok = await ui.confirm({
      title: `Make ${firstName(name)} the admin?`,
      message: 'They get admin rights and you become a regular member.',
      confirmLabel: 'Transfer admin',
    })
    if (!ok) return
    try {
      await transferAdmin(group.groupId, member.user_id)
      await group.refresh()
      ui.success(`${firstName(name)} is now an admin.`)
    } catch (e) {
      ui.error(errorMessage(e))
    }
  }

  return { leave, remove, kick, makeAdmin }
}
