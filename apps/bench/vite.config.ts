import { defineConfig } from 'vite'
export default defineConfig({
  build: { rollupOptions: { input: { decode: 'decode.html', render: 'render.html', compare: 'compare.html' } } },
  worker: { format: 'es' },
})
