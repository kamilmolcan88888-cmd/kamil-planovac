import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps the build working from any sub-path (GitHub Pages, Cloudflare Pages).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',  // new version installs itself on the next open (testing phase: no stale builds)
      injectRegister: null,        // registered in src/state/pwa.ts
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'MealMath',
        short_name: 'MealMath',
        description: 'Eat smart. Spend less. – meal plans that hit your protein and calories every day.',
        lang: 'sk',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F8F4',
        theme_color: '#168A4A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything is precached: the app, the planner worker, fonts and all data. No runtime network.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webp,jpg,jpeg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Long-lived, separately cached chunks: libraries change rarely, data changes with prices/recipes.
        manualChunks(id) {
          if (id.includes('/data/') || id.includes('/prices/')) return 'data';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils|@radix-ui|lucide-react)/.test(id)) return 'ui';
          if (/node_modules\/(i18next|react-i18next|dexie|dexie-react-hooks)/.test(id)) return 'core';
        },
      },
    },
  },
});
