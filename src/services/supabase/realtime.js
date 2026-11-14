import { supabase } from './client'

let channelSeq = 0

/**
 * Subscribe to Postgres changes on several tables with one channel.
 *
 * specs: [{ table, filter? }] where filter is e.g. "hangout_id=eq.<uuid>".
 * Supabase cannot filter DELETE events, so deletes are subscribed without a
 * filter and passed through; callers decide whether the deleted id is
 * theirs (RLS still applies to what each subscriber receives).
 *
 * Returns an unsubscribe function. Always call it on unmount.
 */
export function subscribe(name, specs, onChange) {
  let channel
  try {
    channel = supabase().channel(`${name}:${++channelSeq}`)
  } catch {
    return () => {}
  }

  for (const { table, filter } of specs) {
    for (const event of ['INSERT', 'UPDATE']) {
      channel.on('postgres_changes', { event, schema: 'public', table, ...(filter ? { filter } : {}) }, (payload) =>
        onChange({ table, event, payload }),
      )
    }
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) =>
      onChange({ table, event: 'DELETE', payload }),
    )
  }

  channel.subscribe()
  return () => {
    supabase().removeChannel(channel)
  }
}

/** Coalesce bursts of realtime events into one reload. */
export function debounce(fn, wait = 250) {
  let timer = null
  const debounced = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}
