// Static server for the benchmark, with optional link shaping.
//   node bench/server.mjs <port> [mbps] [latencyMs]
// Throttling happens here, not in the browser: Chrome's DevTools network
// emulation doesn't reliably cover fetches made from workers, which would
// flatter a library that downloads in a worker. One token bucket is shared by
// every connection, like a real link. Supports Range (media elements use it).
import { createServer } from 'node:http'
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { Readable } from 'node:stream'
import { extname, join, normalize } from 'node:path'

const [port = 4180, mbps = 0, latency = 0] = process.argv.slice(2).map(Number)
const roots = ['dist', 'public']
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css' }

// Shared token bucket: bytes per ms.
const rate = (mbps * 1e6) / 8 / 1000
let tokens = 0, last = Date.now()
const take = (want) => {
  const now = Date.now()
  tokens = Math.min(tokens + (now - last) * rate, rate * 50) // at most 50 ms of burst
  last = now
  const got = Math.min(want, Math.floor(tokens))
  tokens -= got
  return got
}

const gzCache = new Map()
const gzipped = (file) => gzCache.get(file) ?? gzCache.set(file, gzipSync(readFileSync(file))).get(file)

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html'
  const file = roots.map((r) => join(r, path)).find((f) => existsSync(f) && statSync(f).isFile())
  if (!file) { res.writeHead(404).end(); return }
  // Text (JS, HTML, JSON) is gzipped, as any CDN would; audio is sent as is.
  const gz = /\.(js|html|json|css)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] ?? '') ? gzipped(file) : null
  const size = gz ? gz.length : statSync(file).size
  let start = 0, end = size - 1, status = 200
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  if (range) {
    start = range[1] ? Number(range[1]) : size - Number(range[2])
    end = range[2] && range[1] ? Math.min(size - 1, Number(range[2])) : size - 1
    status = 206
  }
  const headers = {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  }
  if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`
  if (gz) { headers['content-encoding'] = 'gzip'; delete headers['accept-ranges'] }
  const send = () => {
    res.writeHead(status, headers)
    if (req.method === 'HEAD') return res.end()
    const stream = gz ? Readable.from([gz.subarray(start, end + 1)]) : createReadStream(file, { start, end, highWaterMark: 64 * 1024 })
    if (!rate) return stream.pipe(res)
    // Paced: each chunk is written in slices as tokens accrue; the file stream waits meanwhile.
    let closed = false, ended = false, busy = false
    res.on('close', () => { closed = true; stream.destroy() })
    stream.on('end', () => { ended = true; if (!busy) res.end() })
    stream.on('data', (chunk) => {
      stream.pause(); busy = true
      let off = 0
      const pump = () => {
        if (closed) return
        while (off < chunk.length) {
          const n = take(Math.min(16384, chunk.length - off))
          if (!n) return setTimeout(pump, 2)
          const ok = res.write(chunk.subarray(off, off + n))
          off += n
          if (!ok) return res.once('drain', pump)
        }
        busy = false
        if (ended) res.end(); else stream.resume()
      }
      pump()
    })
  }
  latency ? setTimeout(send, latency) : send()
}).listen(port, () => console.log(`bench server :${port} ${mbps ? `${mbps} Mbps, ${latency} ms` : 'unthrottled'}`))
