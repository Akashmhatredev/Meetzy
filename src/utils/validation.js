/** Small form validators that return an error string or ''. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function email(value) {
  if (!value?.trim()) return 'Enter your email.'
  return EMAIL_RE.test(value.trim()) ? '' : 'That email looks incomplete.'
}

export function password(value) {
  if (!value) return 'Enter a password.'
  if (value.length < 8) return 'Use at least 8 characters.'
  if (value.length > 72) return 'Use at most 72 characters.'
  return ''
}

export function newPassword(value) {
  const base = password(value)
  if (base) return base
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Mix letters and at least one number.'
  return ''
}

export function required(label, min = 1, max = 200) {
  return (value) => {
    const v = (value ?? '').trim()
    if (v.length < min) return min > 1 ? `${label} needs at least ${min} characters.` : `Enter ${label.toLowerCase()}.`
    if (v.length > max) return `${label} can be at most ${max} characters.`
    return ''
  }
}

export function optionalMax(label, max) {
  return (value) => ((value ?? '').trim().length > max ? `${label} can be at most ${max} characters.` : '')
}

export function inviteCode(value) {
  const v = normalizeInviteCode(value)
  if (!v) return 'Enter the invite code.'
  return /^[A-HJ-NP-Z2-9]{8}$/.test(v) ? '' : 'Invite codes are 8 letters and numbers.'
}

/** Accept a pasted link or a code typed with spaces/dashes. */
export function normalizeInviteCode(value = '') {
  const fromLink = value.match(/join\/([A-Za-z0-9-]+)/)
  const raw = fromLink ? fromLink[1] : value
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

export function validateAll(fields) {
  const errors = {}
  for (const [key, [validator, value]] of Object.entries(fields)) {
    const message = validator(value)
    if (message) errors[key] = message
  }
  return errors
}
