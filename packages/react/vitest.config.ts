import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { sourceAliases } from '../source.mjs'

// Tests run in real Chromium, not a simulated DOM: layout, ResizeObserver,
// pointer capture and <audio> behave differently (or not at all) in jsdom.
export default defineConfig({
  // @sillon/core from its source, so tests need no build first.
  resolve: { alias: sourceAliases },
  test: {
    include: ['test/**/*.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      // A fake microphone (a steady tone) that needs no permission prompt, for the recorder tests.
      provider: playwright({
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
        contextOptions: { permissions: ['microphone'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
})
