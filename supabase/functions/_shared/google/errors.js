import { EngineError } from '../engine/errors.js'

const KEY_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g
const DEFAULT_TIMEOUT_MS = 15000

/** Strip anything that looks like an API key and cap the length. */
export function sanitize(text) {
  return String(text ?? '')
    .replace(KEY_PATTERN, '[redacted]')
    .replace(/key=[^&\s]+/gi, 'key=[redacted]')
    .slice(0, 200)
}

/** Turn a non-2xx Google response into a safe EngineError. */
export async function googleError(service, response) {
  let status = ''
  let message = ''
  try {
    const body = await response.json()
    const err = Array.isArray(body) ? body[0]?.error : body?.error
    status = err?.status ?? ''
    message = err?.message ?? ''
  } catch {
    // Non-JSON error body; the HTTP status is enough.
  }
  const detail = status ? `${status}` : `HTTP ${response.status}`
  const error = new EngineError(
    'google_error',
    `Google ${service} request failed (${detail}). Check the server key and that the API is enabled.`,
    502,
  )
  error.googleStatus = status || String(response.status)
  error.googleMessage = sanitize(message)
  return error
}

/** fetch with a timeout; network failures become EngineError('google_error'). */
export async function googleFetch(fetchImpl, service, url, init = {}) {
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
      : undefined
  let response
  try {
    response = await fetchImpl(url, { ...init, signal })
  } catch (cause) {
    const error = new EngineError('google_error', `Could not reach Google ${service}. Try again shortly.`, 502)
    error.googleMessage = sanitize(cause?.message)
    throw error
  }
  if (!response.ok) throw await googleError(service, response)
  return response
}
