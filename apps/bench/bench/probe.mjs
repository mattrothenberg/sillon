import { chromium, webkit } from 'playwright';
const check = async () => {
  const out = { AudioDecoder: typeof AudioDecoder !== 'undefined' };
  if (out.AudioDecoder) {
    for (const codec of ['mp3', 'opus', 'mp4a.40.2', 'flac', 'vorbis']) {
      try { out[codec] = (await AudioDecoder.isConfigSupported({ codec, sampleRate: 44100, numberOfChannels: 2 })).supported; } catch (e) { out[codec] = 'err ' + e.message; }
    }
  }
  out.cssMaskImage = CSS.supports('mask-image', 'linear-gradient(red,red)');
  out.clipPathPath = CSS.supports('clip-path', 'path("M0 0 L1 1 Z")');
  out.offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  out.paintWorklet = typeof CSS.paintWorklet !== 'undefined';
  out.ua = navigator.userAgent;
  return out;
};
for (const [name, bt, opts] of [['chromium-headless', chromium, {}], ['webkit', webkit, {}]]) {
  try {
    const b = await bt.launch(opts); const p = await b.newPage();
    await p.goto('https://example.com').catch(() => {});
    console.log(name, JSON.stringify(await p.evaluate(check)));
    if (name.startsWith('chromium')) { await p.goto('chrome://gpu'); const t = await p.evaluate(() => document.body.innerText); console.log(t.split('\n').filter(l => /Compositing|Rasterization|WebGL:|GL_RENDERER|Canvas/.test(l)).slice(0, 8).join('\n')); }
    await b.close();
  } catch (e) { console.log(name, 'FAILED', e.message.split('\n')[0]); }
}
