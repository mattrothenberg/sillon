import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { sourceAliases } from '../../packages/source.mjs'

export default defineConfig({
  // The public address: social cards and canonical URLs are made absolute against it.
  site: 'https://sillon.mattrothenberg.com',
  integrations: [react()],
  server: { port: 5180 },
  devToolbar: { enabled: false },
  // The peaks decoder runs in a module worker.
  vite: { plugins: [tailwindcss()], resolve: { alias: sourceAliases }, worker: { format: 'es' } },
})
