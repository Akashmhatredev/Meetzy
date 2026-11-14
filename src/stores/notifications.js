import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '@/services/supabase/notifications'
import { subscribe } from '@/services/supabase/realtime'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref([])
  const loaded = ref(false)
  let stop = null
  let currentUser = null

  const unreadCount = computed(() => items.value.filter((n) => !n.read_at).length)

  async function load() {
    items.value = await api.listNotifications()
    loaded.value = true
  }

  function start(userId) {
    if (currentUser === userId) return
    stopListening()
    currentUser = userId
    load().catch(() => {})
    stop = subscribe('notifications', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], ({ event, payload }) => {
      if (event === 'INSERT') {
        if (!items.value.some((n) => n.id === payload.new.id)) items.value.unshift(payload.new)
      } else if (event === 'UPDATE') {
        items.value = items.value.map((n) => (n.id === payload.new.id ? payload.new : n))
      } else if (event === 'DELETE') {
        items.value = items.value.filter((n) => n.id !== payload.old?.id)
      }
    })
  }

  function stopListening() {
    stop?.()
    stop = null
    currentUser = null
    items.value = []
    loaded.value = false
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    items.value = items.value.map((n) => ({ ...n, read_at: n.read_at ?? now }))
    await api.markNotificationsRead(null)
  }

  async function markRead(id) {
    const now = new Date().toISOString()
    items.value = items.value.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n))
    await api.markNotificationsRead([id])
  }

  async function remove(id) {
    items.value = items.value.filter((n) => n.id !== id)
    await api.deleteNotification(id)
  }

  return { items, loaded, unreadCount, load, start, stopListening, markAllRead, markRead, remove }
})
