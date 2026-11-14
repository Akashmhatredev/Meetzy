import { supabase, unwrap } from './client'

export async function listNotifications(limit = 40) {
  return unwrap(
    await supabase()
      .from('notifications')
      .select('id, type, title, body, group_id, hangout_id, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

export async function markNotificationsRead(ids = null) {
  return unwrap(await supabase().rpc('mark_notifications_read', { p_ids: ids }))
}

export async function deleteNotification(id) {
  unwrap(await supabase().from('notifications').delete().eq('id', id))
}
