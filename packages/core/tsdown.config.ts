import { defineConfig } from 'tsdown'

export default defineConfig({
  // The worker is its own entry: streamPeaks starts it from a separate file.
  entry: ['src/index.ts', 'src/mp3.ts', 'src/worker.ts'],
  format: 'esm',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  publint: true,
  attw: { level: 'error', profile: 'esm-only' },
  plugins: [
    {
      // Source points the worker at worker.ts, which Vite serves in development;
      // the published files are .js.
      name: 'worker-url',
      transform(code, id) {
        if (!id.endsWith('/src/stream.ts')) return
        const out = code.replace("new URL('./worker.ts', import.meta.url)", "new URL('./worker.js', import.meta.url)")
        if (out === code) throw new Error('worker-url: no worker URL in stream.ts')
        // Same length, so nothing moves and the source map stays right.
        return { code: out, map: null }
      },
    },
  ],
})
