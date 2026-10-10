import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/* 部署在子路径下就设 PERIGEE_BASE=/xxx/（结尾带斜杠）；默认挂在站点根 */
const BASE = process.env.PERIGEE_BASE || '/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      selfDestroying: true,
      includeAssets: ['favicon-32.png'],
      manifest: {
        name: 'Perigee',
        short_name: 'Perigee',
        description: 'A home for you and your Claude',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#f2f1ef',
        theme_color: '#f2f1ef',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'] },
    }),
  ],
  build: { outDir: 'dist', sourcemap: false },
  // 本地开发：npm run dev 时把 /api 转给本机网关
  server: { proxy: { '/api': { target: process.env.PERIGEE_GATEWAY_URL || 'http://127.0.0.1:3003', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } } },
})
