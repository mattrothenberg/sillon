import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  integrations: [react()],
  server: { port: 5180 },
  devToolbar: { enabled: false },
  // The peaks decoder runs in a module worker.
  vite: { plugins: [tailwindcss()], worker: { format: 'es' } },
})
