import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Separate from electron.vite.config.ts on purpose — that one builds three
 * Electron bundles and knows nothing about running tests. Only pure modules
 * are unit-tested here (anything importing `electron` needs the real runtime
 * and is covered by the Playwright pass instead), so this config is
 * deliberately minimal.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  define: {
    // src/shared/channel.ts reads this build-time define; anything that
    // transitively imports it would throw ReferenceError without it.
    __GAMUT_CHANNEL__: '"stable"'
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
