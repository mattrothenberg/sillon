import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  publint: true,
  attw: { level: 'error', profile: 'esm-only' },
})
