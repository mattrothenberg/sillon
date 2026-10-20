// Serves /audio/* with byte ranges. Static assets always answer with the whole
// file, and a browser can only start playback mid-file, or seek past what it has
// downloaded, if the server returns just the bytes it asks for (206 Partial Content).
// Everything else on the site is served as plain assets, without this script.

const RANGE = /^bytes=(\d*)-(\d*)$/

export default {
  async fetch(request, env) {
    // Ask for the whole file: the assets binding doesn't do ranges itself.
    const headers = new Headers(request.headers)
    headers.delete('Range')
    const asset = await env.ASSETS.fetch(new Request(request.url, { method: request.method, headers }))
    if (asset.status !== 200) return asset

    const out = new Headers(asset.headers)
    out.set('Accept-Ranges', 'bytes')
    const m = RANGE.exec(request.headers.get('Range') ?? '')
    if (!m || (m[1] === '' && m[2] === '')) return new Response(asset.body, { status: 200, headers: out })

    const bytes = await asset.arrayBuffer()
    const size = bytes.byteLength
    // bytes=a-b, bytes=a- (to the end), or bytes=-n (the last n bytes).
    let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
    let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
    if (start >= size || start > end) {
      out.set('Content-Range', `bytes */${size}`)
      return new Response(null, { status: 416, headers: out })
    }
    out.set('Content-Range', `bytes ${start}-${end}/${size}`)
    out.set('Content-Length', String(end - start + 1))
    return new Response(request.method === 'HEAD' ? null : bytes.slice(start, end + 1), { status: 206, headers: out })
  },
}
