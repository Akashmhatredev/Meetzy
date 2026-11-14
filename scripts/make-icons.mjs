/**
 * Rasterise the Meetzy logo into the PWA / favicon / social PNGs in
 * public/icons. Run once after changing the logo:
 *
 *   npm run icons
 *
 * Needs Playwright with a Chromium or Chrome browser. It isn't a project
 * dependency; point PLAYWRIGHT_FROM at any folder whose node_modules has it
 * (e.g. PLAYWRIGHT_FROM=../PythonLearningPlatform), or `npm i -D playwright`.
 */
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const from = process.env.PLAYWRIGHT_FROM ? resolve(root, process.env.PLAYWRIGHT_FROM, 'package.json') : resolve(root, 'package.json')
const { chromium } = createRequire(from)('playwright')

const mark = (await readFile(resolve(root, 'public/favicon.svg'), 'utf8')).replace('<svg ', '<svg width="100%" height="100%" ')

const ICONS = [
  { file: 'icon-192.png', size: 192, pad: 0.12, bg: '#101827', radius: 0.22 },
  { file: 'icon-512.png', size: 512, pad: 0.12, bg: '#101827', radius: 0.22 },
  { file: 'maskable-512.png', size: 512, pad: 0.24, bg: '#101827', radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.14, bg: '#101827', radius: 0 },
  { file: 'favicon-32.png', size: 32, pad: 0, bg: 'transparent', radius: 0 },
]

await mkdir(resolve(root, 'public/icons'), { recursive: true })
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' })
const page = await browser.newPage({ deviceScaleFactor: 1 })

for (const icon of ICONS) {
  const inner = Math.round(icon.size * (1 - icon.pad * 2))
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div style="width:${icon.size}px;height:${icon.size}px;display:flex;align-items:center;justify-content:center;background:${icon.bg};border-radius:${icon.radius * icon.size}px">
      <div style="width:${inner}px;height:${inner}px">${mark}</div>
    </div></body></html>`)
  await page.screenshot({ path: resolve(root, 'public/icons', icon.file), omitBackground: true })
  console.log('wrote', icon.file)
}

// Social share image (1200x630)
await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(`<html><body style="margin:0">
  <div style="width:1200px;height:630px;background:#101827;display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;font-family:system-ui,sans-serif">
    <div style="width:260px;height:260px;flex:none">${mark}</div>
    <div>
      <div style="color:#fff;font-size:92px;font-weight:800;letter-spacing:-3px">meetzy</div>
      <div style="color:#65D6A4;font-size:40px;font-weight:700;margin-top:8px">Less planning. More meeting.</div>
      <div style="color:#93A0B5;font-size:28px;margin-top:20px">Your friends are everywhere. Meetzy finds the middle.</div>
    </div>
  </div></body></html>`)
await page.screenshot({ path: resolve(root, 'public/icons/og-image.png') })
console.log('wrote og-image.png')
await browser.close()
