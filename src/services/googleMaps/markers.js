/**
 * DOM builders for AdvancedMarkerElement content. Everything user-provided
 * goes through textContent, never innerHTML.
 */
import { initials } from '@/utils/format'

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

const BASE_PIN =
  'display:flex;align-items:center;justify-content:center;border-radius:9999px;box-shadow:0 4px 14px rgba(16,24,39,.25);font-family:var(--font-sans);'

/** A friend: avatar (or initials) ringed in their route colour. */
export function memberPin({ name, avatarUrl, color, isYou = false }) {
  const wrap = el('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform:translateY(4px);'
  const bubble = el('div')
  bubble.style.cssText = `${BASE_PIN}width:40px;height:40px;background:#fff;border:3px solid ${color};overflow:hidden;font-weight:700;font-size:13px;color:#101827;`
  if (avatarUrl) {
    const img = el('img')
    img.src = avatarUrl
    img.alt = ''
    img.referrerPolicy = 'no-referrer'
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
    img.onerror = () => {
      img.remove()
      bubble.textContent = initials(name)
    }
    bubble.append(img)
  } else {
    bubble.textContent = initials(name)
  }
  const tail = el('div')
  tail.style.cssText = `width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${color};margin-top:-1px;`
  wrap.append(bubble, tail)
  if (isYou) {
    const tag = el('div', null, 'You')
    tag.style.cssText = `margin-top:2px;padding:1px 6px;border-radius:9999px;background:${color};color:#fff;font-size:10px;font-weight:700;`
    wrap.append(tag)
  }
  wrap.setAttribute('aria-label', name)
  return wrap
}

/** The optimised meeting area. */
export function meetingPin() {
  const wrap = el('div')
  wrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;'
  const halo = el('div')
  halo.style.cssText = 'position:absolute;inset:0;border-radius:9999px;background:rgba(101,214,164,.28);border:2px dashed #27a36f;'
  const core = el('div')
  core.style.cssText = `${BASE_PIN}position:relative;width:28px;height:28px;background:#65d6a4;border:3px solid #101827;`
  const dot = el('div')
  dot.style.cssText = 'width:8px;height:8px;border-radius:9999px;background:#101827;'
  core.append(dot)
  wrap.append(halo, core)
  wrap.setAttribute('aria-label', 'Meeting area')
  return wrap
}

/** A candidate venue: rank number; highlighted when selected or chosen. */
export function venuePin({ rank, selected = false, final = false, label }) {
  const pin = el('div', null, final ? '★' : String(rank ?? '•'))
  const bg = final ? '#101827' : selected ? '#65d6a4' : '#ffffff'
  const fg = final ? '#65d6a4' : '#101827'
  const size = selected || final ? 38 : 30
  pin.style.cssText = `${BASE_PIN}width:${size}px;height:${size}px;background:${bg};color:${fg};border:2px solid #101827;font-weight:800;font-size:${selected || final ? 15 : 12}px;transition:transform .15s;`
  if (label) pin.setAttribute('aria-label', label)
  return pin
}

/** A plain draggable pin for the location picker. */
export function pickerPin() {
  const wrap = el('div')
  wrap.innerHTML =
    '<svg width="40" height="48" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 47c-1.6-2.3-16-17.4-16-27.6C4 10.5 11.2 3 20 3s16 7.5 16 16.4C36 29.6 21.6 44.7 20 47z" fill="#65d6a4" stroke="#101827" stroke-width="2.5"/><circle cx="20" cy="19.5" r="6" fill="#101827"/></svg>'
  wrap.style.cssText = 'filter:drop-shadow(0 4px 8px rgba(16,24,39,.3));cursor:grab;'
  return wrap
}

/** Info window body for a friend. */
export function memberInfo({ name, address, travel }) {
  const box = el('div')
  box.style.cssText = 'min-width:180px;max-width:240px;color:#172033;'
  box.append(el('div', null, name))
  box.firstChild.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:2px;'
  if (address) {
    const a = el('div', null, address)
    a.style.cssText = 'font-size:12px;color:#5d6980;'
    box.append(a)
  }
  if (travel) {
    const t = el('div', null, travel)
    t.style.cssText = 'margin-top:6px;font-size:12px;font-weight:600;color:#1e825a;'
    box.append(t)
  }
  return box
}

export function venueInfo({ name, address, detail }) {
  return memberInfo({ name, address, travel: detail })
}
