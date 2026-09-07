import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Tests target src/shared/*.ts and the handful of renderer/src/lib/*.ts
// modules that are equally pure (no React, no Electron, no DOM — just
// tree-building/filtering logic extracted out of a .tsx component so it's
// actually testable), so a plain node environment is enough; no jsdom
// needed. Resolves '@shared'/'@renderer' the same way
// electron.vite.config.ts and tsconfig.web.json do, so a test imports a
// module the exact same way the app itself does.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    include: ['src/shared/**/*.test.ts', 'src/renderer/src/lib/**/*.test.ts'],
    environment: 'node'
  }
})
