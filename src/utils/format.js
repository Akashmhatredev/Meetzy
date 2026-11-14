export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase()
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || 'Someone'
}

/** 1500 → "25 min", 3900 → "1 h 5 min". Null stays honest: "—". */
export function duration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function distance(meters) {
  if (meters == null) return '—'
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(meters < 9950 ? 1 : 0)} km`
}

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

export function timeAgo(value) {
  if (!value) return ''
  const diff = (new Date(value).getTime() - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return relativeFormatter.format(Math.round(diff / size), unit)
  }
  return 'just now'
}

export function dateTime(value, options = {}) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(new Date(value))
}

export function longDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

/** Value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(value) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null
}

export const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: { label: 'Free', symbols: 'Free', rank: 0 },
  PRICE_LEVEL_INEXPENSIVE: { label: 'Inexpensive', symbols: '₹', rank: 1 },
  PRICE_LEVEL_MODERATE: { label: 'Moderate', symbols: '₹₹', rank: 2 },
  PRICE_LEVEL_EXPENSIVE: { label: 'Expensive', symbols: '₹₹₹', rank: 3 },
  PRICE_LEVEL_VERY_EXPENSIVE: { label: 'Very expensive', symbols: '₹₹₹₹', rank: 4 },
}

/** Google returns a price *level*, not a currency; show it as a scale. */
export function priceLevel(level) {
  const info = PRICE_LEVELS[level]
  if (!info) return null
  const symbol = currencySymbol()
  return { ...info, symbols: info.rank === 0 ? 'Free' : symbol.repeat(info.rank) }
}

function currencySymbol() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    const currency = { IN: 'INR', US: 'USD', GB: 'GBP', JP: 'JPY', CA: 'CAD', AU: 'AUD' }[region]
    if (currency) {
      return (
        new Intl.NumberFormat(navigator.language, { style: 'currency', currency })
          .formatToParts(0)
          .find((p) => p.type === 'currency')?.value ?? '$'
      )
    }
    if (['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'PT', 'BE', 'AT', 'FI'].includes(region)) return '€'
  } catch {
    // fall through
  }
  return '$'
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}
