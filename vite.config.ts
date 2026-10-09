import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom domain (museio.io) serves at site root. Override with BASE_PATH=/muse/ for the
// github.io project URL without a custom domain. Dev server stays at '/'.
const PAGES_BASE = '/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : (process.env.BASE_PATH || PAGES_BASE),
  plugins: [react()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
}));
