import { defineConfig } from 'vite'
import { sourceAliases } from '../../packages/source.mjs'
export default defineConfig({
  build: { rollupOptions: { input: { decode: 'decode.html', render: 'render.html', compare: 'compare.html', lab: 'lab.html', feed: 'feed.html', runtime: 'runtime.html' } } },
  resolve: { alias: sourceAliases },
  worker: { format: 'es' },
})
