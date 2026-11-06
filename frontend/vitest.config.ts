import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default defineConfig(configEnv =>
  mergeConfig(viteConfig(configEnv), {
    test: {
      environment: 'jsdom',
      // Tests live in tests/, never next to the code in src/.
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
    },
  })
)
