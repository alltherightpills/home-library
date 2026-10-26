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
