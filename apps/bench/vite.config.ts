import { defineConfig } from 'vite'
export default defineConfig({
  build: { rollupOptions: { input: { decode: 'decode.html', render: 'render.html', compare: 'compare.html', lab: 'lab.html', feed: 'feed.html', runtime: 'runtime.html' } } },
  worker: { format: 'es' },
})
