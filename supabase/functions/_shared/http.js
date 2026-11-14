/**
 * HTTP helpers shared by the Edge Functions: CORS, JSON responses, error
 * mapping and caller authentication.
 */
import { EngineError } from './engine/errors.js'

export const ERROR_STATUS = {
  invalid_request: 400,
  invalid_input: 400,
  unauthorized: 401,
  not_authenticated: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  already_running: 409,
  hangout_closed: 409,
  calculation_running: 409,
  not_enough_locations: 422,
  no_activities: 422,
  no_venues: 422,
  no_routes: 422,
  too_many_participants: 422,
  rate_limited: 429,
  google_error: 502,
  not_configured: 503,
  internal: 500,
}

const DEFAULT_MESSAGES = {
  invalid_request: 'The request was not valid.',
  unauthorized: 'Please sign in again.',
  forbidden: 'You are not allowed to do that.',
  not_found: 'That hangout does not exist or you are not a member.',
  already_running: 'A calculation is already running for this hangout.',
  hangout_closed: 'This hangout is closed.',
  rate_limited: 'Too many calculations. Try again later.',
  internal: 'Something went wrong. Please try again.',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * CORS headers. ALLOWED_ORIGINS is a comma-separated allow-list; when it is
 * unset (local development) any origin is allowed.
 */
export function corsHeaders(origin, env) {
  const allowed = String(env?.('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let allow = '*'
  if (allowed.length) allow = origin && allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function json(status, body, cors = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function errorResponse(status, code, message, cors = {}) {
  return json(status, { ok: false, error: { code, message: message || DEFAULT_MESSAGES[code] || DEFAULT_MESSAGES.internal } }, cors)
}

export function preflight(cors) {
  return new Response('ok', { status: 200, headers: cors })
}

export function bearerToken(req) {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * PostgREST errors from our RPCs carry a stable code in `message` and a
 * sentence in `details` (see supabase/migrations/*_functions.sql).
 */
export function dbErrorInfo(error) {
  const code = error?.message && ERROR_STATUS[error.message] ? error.message : 'internal'
  return {
    status: ERROR_STATUS[code],
    code,
    message: code === 'internal' ? DEFAULT_MESSAGES.internal : error?.details || DEFAULT_MESSAGES[code],
  }
}

/** Any thrown value -> { status, code, message } safe to return to the client. */
export function errorInfo(err) {
  if (err instanceof EngineError || (err && err.name === 'EngineError')) {
    const status = ERROR_STATUS[err.code] ?? err.status ?? 500
    return { status, code: err.code, message: err.message }
  }
  if (err && err.isDbError) return dbErrorInfo(err.dbError)
  return { status: 500, code: 'internal', message: DEFAULT_MESSAGES.internal }
}

export class DbError extends Error {
  constructor(dbError) {
    super(dbError?.message ?? 'database error')
    this.isDbError = true
    this.dbError = dbError
  }
}

/** Unwrap a supabase-js { data, error } result or throw a DbError. */
export function unwrap(result) {
  if (result?.error) throw new DbError(result.error)
  return result?.data ?? null
}

/**
 * Verifies the caller's JWT with Supabase Auth.
 * @returns {Promise<{id:string}|null>}
 */
export async function authenticate(admin, req) {
  const token = bearerToken(req)
  if (!token) return null
  try {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data?.user?.id) return null
    return data.user
  } catch {
    return null
  }
}

export function firstName(fullName) {
  const name = String(fullName ?? '').trim().split(/\s+/)[0]
  return name || null
}
