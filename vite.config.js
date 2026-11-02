import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // The app is served from https://alltherightpills.github.io/home-library/
  base: '/home-library/',
  plugins: [
    react(),
    VitePWA({
      // Check for a new version each time the app opens, and switch to it automatically.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png'],
      // Store the app's files on the phone, including the barcode engine (.wasm), for offline use.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
        // Keep each cover on the phone the first time it's shown, and show that
        // copy from then on. Open Library's take 1–4 seconds each to arrive (two
        // hops through archive.org). The images come from other sites without
        // permission to read them (status 0), which is fine for showing them.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'].includes(url.hostname) ||
              url.pathname.includes('/storage/v1/object/public/covers/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 8000, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Home Library',
        short_name: 'Library',
        description: 'Catalog of my personal library',
        theme_color: '#2f5d50',
        background_color: '#f4efe4',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
