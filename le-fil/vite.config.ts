import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Servi depuis GitHub Pages sous /le-fil/ en production ; racine en dev (npm run dev).
const base = process.env.NODE_ENV === 'production' ? '/le-fil/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.ico', 'icons/favicon.svg'],
      manifest: {
        name: 'Le Fil',
        short_name: 'Le Fil',
        description: 'Projets, lots, tâches — gestionnaire de projets personnels.',
        theme_color: '#f2c015',
        background_color: '#fbfbf9',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${base}icons/icon-maskable-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: `${base}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Appui long sur l'icône → « nouveau lot » ; menu Partager d'Android → crée un lot
        // (voir src/lib/launchIntent.ts, qui lit ces paramètres au démarrage).
        shortcuts: [
          {
            name: 'Nouveau lot',
            short_name: 'Nouveau lot',
            url: `${base}?nouveau=1`,
            icons: [{ src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' }],
          },
        ],
        share_target: {
          action: base,
          method: 'GET',
          params: { title: 'share_title', text: 'share_text', url: 'share_url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Polices Google mises en cache au premier chargement : l'appli garde sa typo hors ligne.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
