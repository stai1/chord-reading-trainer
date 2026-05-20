import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/chord-reading-trainer/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'app-icon.svg',
        'apple-touch-icon.png',
        'favicon-32x32.png',
      ],
      manifest: {
        // Stable identity so re-installing or moving start_url doesn't
        // confuse Chrome into treating it as a different app.
        id: '/chord-reading-trainer/',
        name: 'Chord Reading Trainer',
        short_name: 'Chord Reading Trainer',
        description:
          'Practice sight-reading notes and chords on the grand staff and in lead-sheet notation.',
        theme_color: '#99BBE6',
        background_color: '#99BBE6',
        display: 'standalone',
        orientation: 'portrait',
        // start_url and scope are relative so they respect the base path.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache every asset Vite emits — including the Opus piano samples
        // — so the app works fully offline once installed and never re-fetches.
        globPatterns: ['**/*.{js,css,html,opus,svg,png,ico,webmanifest}'],
        // Raise the per-file cap above the default 2 MB to be safe for any
        // future larger assets. Individual Opus files are under 200 KB today.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  assetsInclude: ['**/*.opus'],
})
