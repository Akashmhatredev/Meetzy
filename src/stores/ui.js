import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const THEME_KEY = 'meetzy:theme'

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system'
  } catch {
    return 'system'
  }
}

let toastSeq = 0

export const useUiStore = defineStore('ui', () => {
  // -------------------------------------------------------------------
  // Theme: 'light' | 'dark' | 'system'
  // -------------------------------------------------------------------
  const theme = ref(readTheme())
  const isDark = ref(false)
  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

  function applyTheme() {
    isDark.value = theme.value === 'dark' || (theme.value === 'system' && !!media?.matches)
    document.documentElement.classList.toggle('dark', isDark.value)
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute('content', isDark.value ? '#101827' : '#F7F9FC'))
  }

  function setTheme(value) {
    theme.value = value
    try {
      localStorage.setItem(THEME_KEY, value)
    } catch {
      // private mode: theme simply isn't remembered
    }
  }

  watch(theme, applyTheme)
  media?.addEventListener('change', applyTheme)
  if (typeof document !== 'undefined') applyTheme()

  // -------------------------------------------------------------------
  // Toasts
  // -------------------------------------------------------------------
  const toasts = ref([])

  function toast(message, { tone = 'default', timeout = 4200, action = null } = {}) {
    const id = ++toastSeq
    toasts.value.push({ id, message, tone, action })
    if (timeout) setTimeout(() => dismiss(id), timeout)
    return id
  }
  const success = (message, opts) => toast(message, { ...opts, tone: 'success' })
  const error = (message, opts) => toast(message, { timeout: 6500, ...opts, tone: 'error' })

  function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  // -------------------------------------------------------------------
  // Promise-based confirm dialog: `if (await ui.confirm({...})) ...`
  // -------------------------------------------------------------------
  const confirmState = ref(null)

  function confirm({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      confirmState.value = { title, message, confirmLabel, cancelLabel, danger, resolve }
    })
  }

  function settleConfirm(result) {
    confirmState.value?.resolve(result)
    confirmState.value = null
  }

  return { theme, isDark, setTheme, toasts, toast, success, error, dismiss, confirmState, confirm, settleConfirm }
})
