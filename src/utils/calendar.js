/** Build a minimal iCalendar file for a finalised hangout. */
const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
const escape = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

export function hangoutIcs({ id, title, start, durationMinutes = 120, location, url, description }) {
  const begin = new Date(start)
  const end = new Date(begin.getTime() + durationMinutes * 60000)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meetzy//Hangout//EN',
    'BEGIN:VEVENT',
    `UID:${id}@meetzy`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(begin)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(title)}`,
    location ? `LOCATION:${escape(location)}` : null,
    description ? `DESCRIPTION:${escape(description)}` : null,
    url ? `URL:${url}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export function downloadText(filename, text, type = 'text/calendar') {
  const blob = new Blob([text], { type })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
