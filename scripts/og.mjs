// Draws the site's social card (og:image): apps/site/public/og.png, exactly 1200×630.
//   node scripts/og.mjs
// The waveform is the demo song's real peaks, in the site's fonts and colors. It's
// rendered at twice the size and scaled down in the browser, so text and bars stay sharp.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Peaks } from '../packages/core/src/peaks.ts'
import { markSvg } from '../apps/site/src/lib/mark.ts'

const W = 1200, H = 630
const site = (p) => fileURLToPath(new URL(`../apps/site/${p}`, import.meta.url))
// Embedded: a page made with setContent can't read files.
const font = (file) => `url(data:font/woff2;base64,${readFileSync(site(`public/fonts/${file}`)).toString('base64')}) format('woff2')`

// The song's bars, bottom-aligned like the hero's, with a stretch already played.
const peaks = Peaks.decode(new Uint8Array(readFileSync(site('public/audio/avril.peaks'))).buffer)
const BARS = 150, PITCH = W / BARS, BAR = PITCH * 0.6, WAVE = 200, PLAYED = 0.42
const values = peaks.bars(0, peaks.duration, new Float32Array(BARS))
const max = Math.max(...values)
const bars = [...values].map((v, i) => {
  const h = Math.max(3, Math.pow(v / max, 1.6) * WAVE)
  const played = (i + 0.5) / BARS < PLAYED
  return `<rect x="${(i * PITCH + (PITCH - BAR) / 2).toFixed(2)}" y="${(WAVE - h).toFixed(2)}" width="${BAR.toFixed(2)}" height="${h.toFixed(2)}" rx="1.5" fill="${played ? 'var(--ink)' : 'var(--track)'}"/>`
}).join('')

// A few comments under the bars, as on the site's hero.
const hue = (who) => [...who].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360
const pins = [['Ines', 0.06], ['Kofi', 0.2], ['Mara', 0.37], ['Theo', 0.55], ['Yuki', 0.72], ['Lena', 0.93]]
  .map(([who, at]) => `<span class="pin" style="left:${at * 100}%;--hue:${hue(who)}">${who[0]}</span>`).join('')

const html = `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family: 'Instrument Sans'; src: ${font('InstrumentSans.woff2')}; font-weight: 400 700; }
  @font-face { font-family: 'Schibsted Grotesk'; src: ${font('SchibstedGrotesk-SemiBold.woff2')}; font-weight: 600; }
  :root { --paper: #fcfbf9; --ink: #0f0e0c; --ink-2: #605d58; --track: #d4d0c9; --accent: #e0442a; }
  * { margin: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--paper); color: var(--ink); -webkit-font-smoothing: antialiased; }
  .head { position: absolute; left: 80px; top: 76px; }
  .name { display: flex; align-items: center; gap: 22px; font: 600 92px/1 'Schibsted Grotesk'; letter-spacing: -0.03em; }
  .line { margin-top: 26px; font: 400 36px/1.3 'Instrument Sans'; color: var(--ink-2); letter-spacing: -0.005em; }
  .wave { position: absolute; left: 0; right: 0; bottom: 94px; height: ${WAVE}px; }
  .wave svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .cursor { position: absolute; top: -14px; bottom: 0; left: ${PLAYED * 100}%; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--accent); }
  .pins { position: absolute; left: 0; right: 0; bottom: 38px; height: 36px; }
  .pin { position: absolute; top: 0; width: 36px; height: 36px; margin-left: -18px; display: grid; place-items: center; border-radius: 50%;
         background: oklch(0.5 0.12 var(--hue)); color: white; font: 500 17px/1 'Instrument Sans'; box-shadow: 0 0 0 3px var(--paper); }
</style>
<div class="head">
  <div class="name">${markSvg('og', 84)}sillon</div>
  <p class="line">Headless waveform components for React.</p>
</div>
<div class="wave"><svg viewBox="0 0 ${W} ${WAVE}" preserveAspectRatio="none">${bars}</svg><div class="cursor"></div></div>
<div class="pins">${pins}</div>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
const big = await page.screenshot({ type: 'png' })
// Down to exactly 1200×630 with the browser's high-quality resampling.
const png = await page.evaluate(async ([b64, w, h]) => {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob(), { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d').drawImage(img, 0, 0)
  const out = await canvas.convertToBlob({ type: 'image/png' })
  return [...new Uint8Array(await out.arrayBuffer())]
}, [big.toString('base64'), W, H])
await browser.close()
writeFileSync(site('public/og.png'), Uint8Array.from(png))
console.log(`apps/site/public/og.png: ${W}×${H}, ${Math.round(png.length / 1024)} kB`)
