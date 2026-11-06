import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// 4320, so the dashboard runs beside the build dashboard (4310) and the scoring site (5173).
const PORT = 4320

// BASE_PATH, the path the site is served under: `/` by default. Vite wants it with a slash at
// each end.
function basePath(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

export default defineConfig(({ mode }) => {
  // Empty prefix: also read API_PROXY_TARGET and BASE_PATH, which are never exposed to the app.
  const env = loadEnv(mode, process.cwd(), '')

  // The relative /api goes to the dashboard's backend (backend/, `services-dashboard serve`).
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || 'http://localhost:8020', changeOrigin: true },
  }

  return {
    base: basePath(env.BASE_PATH),
    plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } }), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rollupOptions: {
        output: {
          // Libraries change less often than the app, so they're cached apart from it.
          manualChunks(id: string) {
            if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender'))
              return 'echarts'
            if (id.includes('node_modules/@mantine')) return 'mantine'
            if (id.includes('node_modules/@tabler')) return 'icons'
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler'))
              return 'react'
          },
        },
      },
      // ECharts alone is ~600 kB minified, even with only the parts used registered.
      chunkSizeWarningLimit: 700,
    },
    server: { port: PORT, strictPort: true, proxy },
    preview: { port: PORT + 1, strictPort: true, proxy },
  }
})
