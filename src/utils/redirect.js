/** Only same-app paths may be used as post-login redirects (no open redirects). */
export function safeRedirect(value, fallback = '/home') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  return value
}
