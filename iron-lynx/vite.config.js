// Vite konfigurácia.
// base './' = relatívne cesty → build funguje na mnxserveri aj na GitHub Pages v podpriečinku.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,            // dostupné aj z mobilu v LAN (http://IP-PC:5173)
    port: 5173,
    // počas vývoja presmeruje /ws na lokálny signalizačný server (npm run server)
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
